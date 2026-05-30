"""
Standalone async network discovery engine.

Can be run directly:
    python discovery_worker.py 192.168.1.0/24

Or imported and called from FastAPI via `run_scan()`.

Architecture:
  1. Parse the CIDR subnet into individual host IPs.
  2. Fan out concurrent ICMP ping probes (asyncio subprocess calling system ping).
  3. For every host that responds, attempt SNMP GET on sysDescr / sysName
     using credential profiles loaded from the database.
  4. Parse sysDescr to extract vendor and model.
  5. Upsert each discovered device into the database.
  6. Return a list of per-IP results for the API/UI to consume.
"""

import asyncio
import ipaddress
import re
import sys
from datetime import datetime, timezone

from sqlalchemy import select

# Re-use the app's DB machinery
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_value
from app.models.device import Device
from app.models.credential import Credential
from app.models.installed_software import InstalledSoftware


# ---------------------------------------------------------------------------
# 1. ICMP ping via subprocess (no raw-socket privilege required)
# ---------------------------------------------------------------------------

async def ping_host(ip: str, timeout: int = 1) -> tuple[bool, int | None]:
    """Returns (alive, ttl). TTL is parsed from ping stdout when available."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", str(timeout), str(ip),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout + 2)
        if proc.returncode != 0:
            return False, None
        # Parse "ttl=<N>" from ping output (Linux format)
        ttl = None
        m = re.search(r'ttl=(\d+)', stdout.decode("utf-8", errors="replace"), re.IGNORECASE)
        if m:
            ttl = int(m.group(1))
        return True, ttl
    except (asyncio.TimeoutError, OSError):
        return False, None


def guess_os_from_ttl(ttl: int) -> str | None:
    """
    Infer OS family from ICMP reply TTL.
    TTL decrements per hop, so we find the nearest standard initial value.
    Standard initial TTLs: 255 (network gear), 128 (Windows), 64 (Linux/macOS), 254 (Solaris).
    """
    if ttl <= 0:
        return None
    # Find which standard initial TTL this response most likely came from
    # by picking the smallest initial TTL that is >= the observed TTL
    candidates = [
        (64,  "Linux / macOS"),
        (128, "Windows"),
        (254, "Solaris / HP-UX"),
        (255, "Network Device (Cisco/Juniper)"),
    ]
    for initial, label in candidates:
        if ttl <= initial:
            hops = initial - ttl
            # Reject if hops seem unreasonably large (bad TTL bucket guess)
            if hops <= 30:
                return f"{label} (TTL {ttl}, ~{hops} hop{'s' if hops != 1 else ''})"
    return None


# ---------------------------------------------------------------------------
# 2. SNMP fingerprinting
# ---------------------------------------------------------------------------

OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"
OID_SYS_LOCATION = "1.3.6.1.2.1.1.6.0"
OID_HR_SW_INSTALLED = "1.3.6.1.2.1.25.6.3.1.2"


async def snmp_get(ip: str, community: str, oid: str, timeout: int = 2) -> str | None:
    """SNMP v2c GET using aiosnmp."""
    try:
        import aiosnmp
        async with aiosnmp.Snmp(host=ip, community=community, port=161, timeout=timeout, retries=1) as snmp:
            result = await snmp.get(oid)
            if result and result[0].value is not None:
                val = result[0].value
                return val.decode() if isinstance(val, bytes) else str(val)
    except Exception:
        return None
    return None


async def snmp_walk(ip: str, community: str, oid: str, timeout: int = 5) -> list[str]:
    try:
        import aiosnmp
        async with aiosnmp.Snmp(host=ip, community=community, port=161, timeout=timeout, retries=1) as snmp:
            results = await snmp.walk(oid)
            out = []
            for r in results:
                val = r.value
                if val is not None:
                    out.append(val.decode("utf-8", errors="replace") if isinstance(val, bytes) else str(val))
            return out
    except Exception:
        return []


async def snmp_fingerprint(ip: str, community: str) -> dict:
    sys_descr, sys_name, sys_location = await asyncio.gather(
        snmp_get(ip, community, OID_SYS_DESCR),
        snmp_get(ip, community, OID_SYS_NAME),
        snmp_get(ip, community, OID_SYS_LOCATION),
    )
    vendor, model = parse_sys_descr(sys_descr or "")
    return {
        "hostname": sys_name,
        "vendor": vendor,
        "model": model,
        "location": sys_location,
        "sys_descr": sys_descr,
        "os_info": parse_os_info(sys_descr),
    }


# ---------------------------------------------------------------------------
# 3. sysDescr parser — vendor / model extraction
# ---------------------------------------------------------------------------

VENDOR_PATTERNS = [
    (r"[Cc]isco",    "Cisco"),
    (r"[Jj]uniper",  "Juniper"),
    (r"[Aa]rista",   "Arista"),
    (r"[Hh]uawei",   "Huawei"),
    (r"[Ll]inux",    "Linux"),
    (r"[Mm]ikro[Tt]ik", "MikroTik"),
    (r"[Ff]ortinet|[Ff]orti[Gg]ate", "Fortinet"),
    (r"[Pp]alo [Aa]lto|PAN-OS", "Palo Alto"),
    (r"[Ww]indows|[Mm]icrosoft", "Microsoft"),
]

MODEL_PATTERNS = [
    (r"C(\d{4}[A-Z]*)",          r"C\1"),       # Cisco Catalyst
    (r"(WS-C\S+)",               r"\1"),         # Cisco WS- models
    (r"(ASR\S+)",                 r"\1"),         # Cisco ASR
    (r"(ISR\S+)",                 r"\1"),         # Cisco ISR
    (r"(MX\d+)",                  r"\1"),         # Juniper MX
    (r"(EX\d+)",                  r"\1"),         # Juniper EX
    (r"(SRX\d+)",                 r"\1"),         # Juniper SRX
    (r"(DCS-\S+)",                r"\1"),         # Arista
    (r"([A-Z]{2,3}-\d{3,5}\S*)",  r"\1"),         # Generic model codes
]


def parse_os_info(descr: str) -> str | None:
    """Extract a short human-readable OS string from sysDescr."""
    if not descr:
        return None
    d = descr.strip()

    m = re.search(r'Linux[^\s]*\s+[^\s]+\s+(\S+)', d)
    if m:
        ver = m.group(1).split('-')[0]
        distro = next((n for n in ('Ubuntu', 'Debian', 'CentOS', 'Red Hat', 'Fedora', 'Alpine') if n.lower() in d.lower()), None)
        return f"Linux {ver}" + (f" ({distro})" if distro else "")

    m = re.search(r'Cisco IOS\S*\s+Software[^,]*,\s+Version\s+(\S+)', d)
    if m:
        return f"IOS {m.group(1).rstrip(',')}"

    m = re.search(r'(IOS-XE|NX-OS)\s+Software.*?Version\s+(\S+)', d)
    if m:
        return f"{m.group(1)} {m.group(2).rstrip(',')}"

    m = re.search(r'JUNOS\s+(\S+)', d, re.IGNORECASE)
    if m:
        return f"JunOS {m.group(1).rstrip(',')}"

    m = re.search(r'Arista.*?EOS\s+version\s+(\S+)', d, re.IGNORECASE)
    if m:
        return f"EOS {m.group(1)}"

    # Windows SNMP format: "Windows <hostname> <major.minor.build> [Server] ..."
    m = re.search(r'Windows\s+\S+\s+(\d+\.\d+)\.(\d+)', d)
    if m:
        nt, build = m.group(1), int(m.group(2))
        is_server = 'Server' in d
        _win_map = {
            '5.0': 'Windows 2000',
            '5.1': 'Windows XP',
            '5.2': 'Windows Server 2003',
            '6.0': ('Windows Server 2008',    'Windows Vista'),
            '6.1': ('Windows Server 2008 R2', 'Windows 7'),
            '6.2': ('Windows Server 2012',    'Windows 8'),
            '6.3': ('Windows Server 2012 R2', 'Windows 8.1'),
            '10.0': ('Windows Server 2016+',  'Windows 10/11'),
        }
        label = _win_map.get(nt)
        if isinstance(label, tuple):
            label = label[0] if is_server else label[1]
        if nt == '10.0' and is_server:
            if build >= 20348:   label = 'Windows Server 2022'
            elif build >= 17763: label = 'Windows Server 2019'
            else:                label = 'Windows Server 2016'
        if label:
            return f"{label} (build {build})"
        return f"Windows NT {nt} build {build}"
    # Standard "Windows Server 2019" or "Windows 10" format
    m = re.search(r'Windows\s+(Server\s+)?(\d{4}[^\s,]*)', d)
    if m:
        return f"Windows {(m.group(1) or '') + m.group(2)}".strip()

    m = re.search(r'FortiGate.*?v(\d[\d.]+)', d, re.IGNORECASE)
    if m:
        return f"FortiOS {m.group(1)}"

    m = re.search(r'RouterOS\s+(\S+)', d, re.IGNORECASE)
    if m:
        return f"RouterOS {m.group(1)}"

    return d[:60].strip() or None


def parse_sys_descr(descr: str) -> tuple[str | None, str | None]:
    vendor = None
    for pattern, name in VENDOR_PATTERNS:
        if re.search(pattern, descr):
            vendor = name
            break

    model = None
    for pattern, repl in MODEL_PATTERNS:
        m = re.search(pattern, descr)
        if m:
            model = m.expand(repl)
            break

    return vendor, model


# ---------------------------------------------------------------------------
# 4. DB upsert — insert or update discovered device
# ---------------------------------------------------------------------------

async def upsert_unknown_device(session, ip: str):
    """Store a non-responding IP as status=unknown only if it doesn't exist yet."""
    result = await session.execute(select(Device).where(Device.ip_address == ip))
    if result.scalar_one_or_none() is None:
        now = datetime.now(timezone.utc)
        session.add(Device(ip_address=ip, status="unknown", created_at=now, updated_at=now))


async def upsert_device(session, ip: str, info: dict, credential_id: int | None):
    result = await session.execute(select(Device).where(Device.ip_address == ip))
    device = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if device is None:
        device = Device(
            ip_address=ip,
            hostname=info.get("hostname"),
            vendor=info.get("vendor"),
            model=info.get("model"),
            location=info.get("location"),
            os_info=info.get("os_info"),
            status="up",
            created_at=now,
            updated_at=now,
        )
        session.add(device)
    else:
        if info.get("hostname"):
            device.hostname = info["hostname"]
        if info.get("vendor"):
            device.vendor = info["vendor"]
        if info.get("model"):
            device.model = info["model"]
        if info.get("location"):
            device.location = info["location"]
        if info.get("os_info"):
            device.os_info = info["os_info"]
        device.status = "up"
        device.updated_at = now

    await session.flush()

    if credential_id:
        from app.models.device_credential import device_credentials
        existing = await session.execute(
            select(device_credentials).where(
                device_credentials.c.device_id == device.id,
                device_credentials.c.credential_id == credential_id,
            )
        )
        if existing.first() is None:
            await session.execute(
                device_credentials.insert().values(
                    device_id=device.id,
                    credential_id=credential_id,
                )
            )

    return device


# ---------------------------------------------------------------------------
# 5. Main scan orchestrator
# ---------------------------------------------------------------------------

async def scan_host(ip: str, communities: list[tuple[int, str]], credential_id: int | None):
    """Scan a single host: ping (capturing TTL), then SNMP fingerprint if alive."""
    alive, ttl = await ping_host(ip)
    if not alive:
        return {"ip": ip, "status": "down", "detail": "No ping response"}

    ttl_os_hint = guess_os_from_ttl(ttl) if ttl is not None else None

    info = {"hostname": None, "vendor": None, "model": None, "os_info": None}

    for cred_id, community in communities:
        result = await snmp_fingerprint(ip, community)
        if result.get("hostname") or result.get("vendor"):
            info = result
            credential_id = cred_id
            break

    # SNMP sysDescr takes priority; TTL hint fills in when SNMP gives nothing
    os_info = info.get("os_info") or ttl_os_hint

    detail = f"Discovered: {info.get('vendor') or 'Unknown'} {info.get('model') or ''}".strip()
    if ttl_os_hint and not info.get("os_info"):
        detail += f" · TTL={ttl}"

    return {
        "ip": ip,
        "status": "up",
        "hostname": info.get("hostname"),
        "vendor": info.get("vendor"),
        "model": info.get("model"),
        "os_info": os_info,
        "detail": detail,
        "_credential_id": credential_id,
    }


async def run_scan(subnet: str, credential_id: int | None = None) -> list[dict]:
    """
    Main entry point. Scans an entire subnet concurrently.

    Algorithm:
      1. Load SNMP community strings from the credentials table.
         If a specific credential_id is given, prioritize it.
      2. Expand the CIDR into usable host addresses.
      3. Fan-out: launch up to 50 concurrent ping+SNMP tasks using a semaphore.
      4. Collect results, upsert discovered devices into the DB.
      5. Return the full result list.
    """
    # Load credential communities
    communities: list[tuple[int, str]] = []
    async with AsyncSessionLocal() as session:
        query = select(Credential).where(Credential.type.in_(["snmp_v2c", "snmp_v3"]))
        result = await session.execute(query)
        creds = result.scalars().all()
        if credential_id:
            creds = sorted(creds, key=lambda c: c.id != credential_id)
        for c in creds:
            if c.community_string:
                try:
                    plain = decrypt_value(c.community_string)
                except Exception:
                    plain = c.community_string
                communities.append((c.id, plain))

    # Expand subnet to host list
    try:
        network = ipaddress.ip_network(subnet, strict=False)
    except ValueError as e:
        return [{"ip": subnet, "status": "error", "detail": str(e)}]

    hosts = [str(h) for h in network.hosts()]
    if not hosts:
        return [{"ip": subnet, "status": "error", "detail": "No hosts in range"}]

    # Cap at /20 (4094 hosts) to avoid accidental massive scans
    if len(hosts) > 4094:
        return [{"ip": subnet, "status": "error", "detail": "Subnet too large (max /20)"}]

    # Concurrent scan with semaphore
    sem = asyncio.Semaphore(50)

    async def throttled_scan(ip):
        async with sem:
            return await scan_host(ip, communities, credential_id)

    results = await asyncio.gather(*[throttled_scan(ip) for ip in hosts])

    # Upsert all hosts into DB — alive ones with full info, non-responding as unknown
    async with AsyncSessionLocal() as session:
        for r in results:
            if r["status"] == "up":
                cred_id = r.pop("_credential_id", None)
                device = await upsert_device(session, r["ip"], r, cred_id)

                # Discover installed software via hrSWInstalledName walk
                community = next((c for cid, c in communities if cid == cred_id), communities[0][1] if communities else "public")
                sw_names = await snmp_walk(r["ip"], community, OID_HR_SW_INSTALLED)
                if sw_names:
                    existing = await session.execute(
                        select(InstalledSoftware.software_name).where(InstalledSoftware.device_id == device.id)
                    )
                    existing_set = {row[0] for row in existing}
                    now = datetime.now(timezone.utc)
                    for name in sw_names:
                        if name and name not in existing_set:
                            session.add(InstalledSoftware(device_id=device.id, software_name=name, discovered_at=now))
            else:
                r.pop("_credential_id", None)
                # Store non-responding IPs as unknown so the poller monitors them
                await upsert_unknown_device(session, r["ip"])
        await session.commit()

    return results


# ---------------------------------------------------------------------------
# 6. CLI entry point
# ---------------------------------------------------------------------------

async def main():
    subnet = sys.argv[1] if len(sys.argv) > 1 else "192.168.1.0/24"
    cred_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
    print(f"Scanning {subnet} ...")
    results = await run_scan(subnet, cred_id)
    up = [r for r in results if r["status"] == "up"]
    down = [r for r in results if r["status"] == "down"]
    print(f"\nScan complete: {len(up)} up, {len(down)} down, {len(results)} total\n")
    for r in results:
        icon = "+" if r["status"] == "up" else "-"
        print(f"  [{icon}] {r['ip']:18s} {r.get('detail', '')}")


if __name__ == "__main__":
    asyncio.run(main())
