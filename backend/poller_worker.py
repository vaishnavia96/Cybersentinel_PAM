"""
Independent async SNMP poller daemon with deep metrics collection.

Run:  python poller_worker.py
      python poller_worker.py --interval 30
"""

import argparse
import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone

import aiosnmp
import redis.asyncio as aioredis
from sqlalchemy import select, insert

from app.core.config import settings
from discovery_worker import parse_os_info, ping_host, guess_os_from_ttl
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_value
from app.models.device import Device
from app.models.credential import Credential
from app.models.device_credential import device_credentials
from app.models.metric import Metric
from app.models.alert_rule import AlertRule
from app.models.active_alert import ActiveAlert

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("poller")

CPU_OIDS = [
    ("1.3.6.1.4.1.9.2.1.58.0", "direct"),
    ("1.3.6.1.4.1.2021.11.11.0", "invert"),
    ("1.3.6.1.2.1.25.3.3.1.2.1", "direct"),
]
MEM_OIDS_UCD = [
    ("1.3.6.1.4.1.2021.4.5.0", "1.3.6.1.4.1.2021.4.6.0", "1.3.6.1.4.1.2021.4.14.0", "1.3.6.1.4.1.2021.4.15.0"),
]
UPTIME_OID = "1.3.6.1.2.1.1.3.0"

_fail_counts: dict[int, int] = {}
FAIL_THRESHOLD = 3


async def ping_host(ip: str, timeout: int = 1) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ping", "-c", "1", "-W", str(timeout), str(ip),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        rc = await asyncio.wait_for(proc.wait(), timeout=timeout + 2)
        return rc == 0
    except (asyncio.TimeoutError, OSError):
        return False


# ── SNMP helpers ──

async def _snmp_get(snmp, oid: str) -> float | None:
    try:
        result = await snmp.get(oid)
        if result and result[0].value is not None:
            return float(result[0].value)
    except Exception:
        pass
    return None


async def _snmp_walk(snmp, oid_prefix: str) -> list:
    try:
        return await snmp.walk(oid_prefix)
    except Exception:
        return []


def _sanitize(s: str) -> str:
    """Strip null bytes and other characters PostgreSQL/JSONB can't store."""
    return s.replace(chr(0), "") if s else s


def _val(r):
    v = r.value
    if v is None:
        return None
    raw = v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v)
    return _sanitize(raw)


def _fval(r):
    try:
        return float(r.value) if r.value is not None else None
    except (ValueError, TypeError):
        return None


def _m(now, device_id, name, value, labels=None):
    lbl = {k: (_sanitize(v) if isinstance(v, str) else v) for k, v in (labels or {}).items()}
    lh = hashlib.md5(json.dumps(lbl, sort_keys=True).encode()).hexdigest()[:16] if lbl else ""
    return {"timestamp": now, "device_id": device_id, "metric_name": name, "metric_value": value, "labels": lbl, "label_hash": lh}


# ── Main device poll ──

async def poll_device(ip: str, community: str, device_id: int) -> list[dict]:
    metrics = []
    now = datetime.now(timezone.utc)

    try:
        async with aiosnmp.Snmp(host=ip, community=community, port=161, timeout=4, retries=1) as snmp:
            # ── Aggregate CPU ──
            cpu_found = False
            for oid, mode in CPU_OIDS:
                val = await _snmp_get(snmp, oid)
                if val is not None:
                    cpu = (100.0 - val) if mode == "invert" else val
                    metrics.append(_m(now, device_id, "cpu_utilization", cpu))
                    cpu_found = True
                    break

            # ── Per-core CPU via hrProcessorLoad walk ──
            cpu_rows = await _snmp_walk(snmp, "1.3.6.1.2.1.25.3.3.1.2")
            core_vals = []
            for i, r in enumerate(cpu_rows):
                v = _fval(r)
                if v is not None:
                    core_vals.append(v)
                    metrics.append(_m(now, device_id, "cpu_load", v, {"core": str(i)}))

            if not cpu_found and core_vals:
                metrics.append(_m(now, device_id, "cpu_utilization", sum(core_vals) / len(core_vals)))
                cpu_found = True

            if not cpu_found:
                user = await _snmp_get(snmp, "1.3.6.1.4.1.2021.11.9.0")
                system = await _snmp_get(snmp, "1.3.6.1.4.1.2021.11.10.0")
                if user is not None and system is not None:
                    metrics.append(_m(now, device_id, "cpu_utilization", user + system))

            # ── Aggregate memory (UCD with buffers/cache correction) ──
            mem_found = False
            for total_oid, free_oid, buf_oid, cache_oid in MEM_OIDS_UCD:
                total = await _snmp_get(snmp, total_oid)
                free = await _snmp_get(snmp, free_oid)
                if total is not None and free is not None and total > 0:
                    buffers = await _snmp_get(snmp, buf_oid) or 0
                    cached = await _snmp_get(snmp, cache_oid) or 0
                    used = total - free - buffers - cached
                    metrics.append(_m(now, device_id, "memory_utilization", max((used / total) * 100.0, 0)))
                    mem_found = True
                    break

            # ── hrStorageTable walk — RAM + Disk partitions ──
            st_descr = await _snmp_walk(snmp, "1.3.6.1.2.1.25.2.3.1.3")
            st_units = await _snmp_walk(snmp, "1.3.6.1.2.1.25.2.3.1.4")
            st_size = await _snmp_walk(snmp, "1.3.6.1.2.1.25.2.3.1.5")
            st_used = await _snmp_walk(snmp, "1.3.6.1.2.1.25.2.3.1.6")

            for d, u, s, us in zip(st_descr, st_units, st_size, st_used):
                descr = _val(d) or ""
                unit = _fval(u) or 1
                total_b = (_fval(s) or 0) * unit
                used_b = (_fval(us) or 0) * unit
                if total_b <= 0:
                    continue
                pct = (used_b / total_b) * 100.0
                dl = descr.lower()
                if "mem" in dl or "ram" in dl or "physical" in dl:
                    stype = "ram"
                elif descr.startswith("/") or "disk" in dl or ":" in descr:
                    stype = "disk"
                else:
                    continue
                label = {"mount": descr, "type": stype}
                metrics.append(_m(now, device_id, "storage_used_pct", pct, label))
                metrics.append(_m(now, device_id, "storage_total_bytes", total_b, label))
                metrics.append(_m(now, device_id, "storage_used_bytes", used_b, label))
                if stype == "ram" and not mem_found:
                    metrics.append(_m(now, device_id, "memory_utilization", pct))
                    mem_found = True

            # ── Interface metrics ──
            if_descr = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.2")
            if_status = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.8")
            if_in = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.10")
            if_out = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.16")
            if_err_in = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.14")
            if_err_out = await _snmp_walk(snmp, "1.3.6.1.2.1.2.2.1.20")

            for i, d in enumerate(if_descr):
                iface = _val(d) or f"if{i}"
                lbl = {"interface": iface}
                for arr, name in [(if_status, "if_oper_status"), (if_in, "if_in_bytes"), (if_out, "if_out_bytes"), (if_err_in, "if_err_in"), (if_err_out, "if_err_out")]:
                    if i < len(arr):
                        v = _fval(arr[i])
                        if v is not None:
                            metrics.append(_m(now, device_id, name, v, lbl))

            # ── Process table (top 20 by memory) ──
            proc_names = await _snmp_walk(snmp, "1.3.6.1.2.1.25.4.2.1.2")
            proc_status = await _snmp_walk(snmp, "1.3.6.1.2.1.25.4.2.1.7")
            proc_mem = await _snmp_walk(snmp, "1.3.6.1.2.1.25.5.1.1.2")
            proc_cpu = await _snmp_walk(snmp, "1.3.6.1.2.1.25.5.1.1.1")

            procs = []
            for i, n in enumerate(proc_names):
                name = _val(n) or ""
                pid = str(n.oid).rsplit(".", 1)[-1]
                mem = _fval(proc_mem[i]) if i < len(proc_mem) else 0
                cpu_t = _fval(proc_cpu[i]) if i < len(proc_cpu) else 0
                st = _fval(proc_status[i]) if i < len(proc_status) else 0
                procs.append({"name": name, "pid": pid, "mem": mem or 0, "cpu_time": cpu_t or 0, "status": st or 0})

            for p in sorted(procs, key=lambda x: x["mem"], reverse=True)[:20]:
                lbl = {"process": p["name"], "pid": p["pid"]}
                metrics.append(_m(now, device_id, "proc_mem_kb", p["mem"], lbl))
                metrics.append(_m(now, device_id, "proc_cpu_time", p["cpu_time"], lbl))
                metrics.append(_m(now, device_id, "proc_status", p["status"], lbl))

            # ── Uptime ──
            uptime = await _snmp_get(snmp, UPTIME_OID)
            if uptime is not None:
                metrics.append(_m(now, device_id, "uptime", uptime))
    except Exception as e:
        log.debug(f"Poll error for {ip}: {e}")

    return metrics


# ── Alert evaluation ──

OPERATORS = {
    ">": lambda v, t: v > t,
    ">=": lambda v, t: v >= t,
    "<": lambda v, t: v < t,
    "<=": lambda v, t: v <= t,
    "=": lambda v, t: v == t,
}


async def evaluate_alerts(metrics: list[dict], device_map: dict, redis_client: aioredis.Redis):
    if not metrics:
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AlertRule).where(AlertRule.metric_name != "syslog_severity"))
        rules = result.scalars().all()

    if not rules:
        return

    latest: dict[tuple[int, str], float] = {}
    for m in metrics:
        if not m.get("labels"):
            key = (m["device_id"], m["metric_name"])
            latest[key] = m["metric_value"]

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        for rule in rules:
            op_fn = OPERATORS.get(rule.operator)
            if not op_fn:
                continue
            for (dev_id, metric_name), value in latest.items():
                if metric_name != rule.metric_name:
                    continue
                violated = op_fn(value, rule.threshold)
                existing = await session.execute(
                    select(ActiveAlert).where(
                        ActiveAlert.device_id == dev_id,
                        ActiveAlert.alert_rule_id == rule.id,
                        ActiveAlert.resolved_at.is_(None),
                    )
                )
                alert = existing.scalar_one_or_none()
                if violated and not alert:
                    dev, _ = device_map.get(dev_id, (None, ""))
                    ip = dev.ip_address if dev else "unknown"
                    new_alert = ActiveAlert(
                        device_id=dev_id, alert_rule_id=rule.id,
                        message=f"{metric_name} {rule.operator} {rule.threshold} (current: {value:.1f}) on {ip}",
                        severity=rule.severity, triggered_at=now,
                    )
                    session.add(new_alert)
                    await session.flush()
                    log.warning(f"  ALERT [{rule.severity}] {new_alert.message}")
                    try:
                        await redis_client.publish("nms_realtime", json.dumps({
                            "type": "alert", "alert_id": new_alert.id, "device_id": dev_id,
                            "ip_address": ip, "severity": rule.severity,
                            "message": new_alert.message, "triggered_at": now.isoformat(), "source": "poller",
                        }))
                    except Exception:
                        pass
                elif not violated and alert:
                    alert.resolved_at = now
                    log.info(f"  RESOLVED alert #{alert.id} for device {dev_id}")
        await session.commit()


# ── Main poll cycle ──

async def run_poll_cycle(redis_client: aioredis.Redis):
    cycle_start = time.monotonic()

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Device, Credential)
            .join(device_credentials, Device.id == device_credentials.c.device_id, isouter=True)
            .join(Credential, Credential.id == device_credentials.c.credential_id, isouter=True)
            .where(Credential.type.in_(["snmp_v2c", "snmp_v3"]) | (Credential.id.is_(None)))
        )
        rows = result.all()

    device_map: dict[int, tuple[Device, str]] = {}
    for dev, cred in rows:
        if dev.id not in device_map and cred and cred.community_string:
            try:
                plain = decrypt_value(cred.community_string)
            except Exception:
                plain = cred.community_string
            device_map[dev.id] = (dev, plain)

    if not device_map:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Device))
            for dev in result.scalars().all():
                device_map[dev.id] = (dev, "public")

    if not device_map:
        log.info("No devices to poll")
        return

    log.info(f"Polling {len(device_map)} devices...")

    # Fan out SNMP polls + ping checks concurrently
    snmp_tasks = {}
    ping_tasks = {}
    for dev_id, (dev, community) in device_map.items():
        snmp_tasks[dev_id] = asyncio.create_task(poll_device(dev.ip_address, community, dev_id))
        ping_tasks[dev_id] = asyncio.create_task(ping_host(dev.ip_address))

    all_metrics: list[dict] = []
    status_updates: list[dict] = []

    for dev_id, (dev, community) in device_map.items():
        metrics = await snmp_tasks[dev_id]
        alive = await ping_tasks[dev_id]
        snmp_ok = len(metrics) > 0

        if snmp_ok:
            all_metrics.extend(metrics)
            _fail_counts[dev_id] = 0

        # Status = ping-based (device reachability)
        if alive:
            device_status = "up"
        else:
            _fail_counts[dev_id] = _fail_counts.get(dev_id, 0) + 1
            device_status = "down" if _fail_counts[dev_id] >= FAIL_THRESHOLD else dev.status

        # SNMP status = separate indicator
        snmp_status = "on" if snmp_ok else "off"

        status_updates.append({"device_id": dev_id, "status": device_status, "snmp_status": snmp_status, "metrics": metrics})

    if all_metrics:
        stored = 0
        from collections import defaultdict
        by_device: dict = defaultdict(list)
        for m in all_metrics:
            by_device[m["device_id"]].append(m)
        # Each device gets its own session so one failure doesn't affect others
        for dev_id, dev_metrics in by_device.items():
            # Deep-sanitize all label strings right before insert
            clean = []
            for m in dev_metrics:
                lbl = {k: (v.replace(chr(0), "") if isinstance(v, str) else v)
                       for k, v in m["labels"].items()}
                clean.append({**m, "labels": lbl})
            async with AsyncSessionLocal() as session:
                try:
                    await session.execute(insert(Metric), clean)
                    await session.commit()
                    stored += len(clean)
                except Exception as e:
                    log.warning(f"  Metrics insert failed for device {dev_id}: {e!r}")
        log.info(f"  Stored {stored} metric samples")

    # Update device statuses + auto-fingerprint devices missing metadata
    async with AsyncSessionLocal() as session:
        for update in status_updates:
            dev_result = await session.execute(select(Device).where(Device.id == update["device_id"]))
            dev = dev_result.scalar_one_or_none()
            if not dev:
                continue
            changed = False
            if dev.status != update["status"]:
                dev.status = update["status"]
                changed = True
                log.info(f"  Device {dev.ip_address} status -> {update['status']}")
            if dev.snmp_status != update["snmp_status"]:
                dev.snmp_status = update["snmp_status"]
                changed = True
                log.info(f"  Device {dev.ip_address} snmp -> {update['snmp_status']}")
            if changed:
                dev.updated_at = datetime.now(timezone.utc)

            # Auto-fingerprint: if device is UP and has metrics but missing hostname, vendor, or os_info
            if update["status"] == "up" and (not dev.hostname or not dev.vendor or not dev.os_info):
                _, community = device_map.get(update["device_id"], (None, "public"))
                try:
                    async with aiosnmp.Snmp(host=dev.ip_address, community=community, port=161, timeout=3, retries=1) as snmp:
                        for oid, attr in [("1.3.6.1.2.1.1.5.0", "hostname"), ("1.3.6.1.2.1.1.6.0", "location")]:
                            if not getattr(dev, attr):
                                r = await snmp.get(oid)
                                if r and r[0].value is not None:
                                    val = r[0].value
                                    setattr(dev, attr, val.decode("utf-8", errors="replace") if isinstance(val, bytes) else str(val))
                        if not dev.vendor or not dev.os_info:
                            r = await snmp.get("1.3.6.1.2.1.1.1.0")
                            if r and r[0].value is not None:
                                descr = r[0].value
                                descr = descr.decode("utf-8", errors="replace") if isinstance(descr, bytes) else str(descr)
                                if not dev.vendor:
                                    for pattern, name in [("isco", "Cisco"), ("uniper", "Juniper"), ("rista", "Arista"), ("inux", "Linux"), ("uawei", "Huawei"), ("ikro", "MikroTik"), ("ortinet", "Fortinet")]:
                                        if pattern.lower() in descr.lower():
                                            dev.vendor = name
                                            break
                                if not dev.os_info:
                                    dev.os_info = parse_os_info(descr)
                    # TTL fallback: if SNMP gave no os_info, ping and infer from TTL
                    if not dev.os_info:
                        try:
                            _, ttl = await ping_host(dev.ip_address)
                            if ttl is not None:
                                dev.os_info = guess_os_from_ttl(ttl)
                        except Exception:
                            pass
                    if dev.hostname or dev.vendor or dev.os_info:
                        dev.updated_at = datetime.now(timezone.utc)
                        log.info(f"  Auto-fingerprinted {dev.ip_address}: hostname={dev.hostname} vendor={dev.vendor} os={dev.os_info}")
                except Exception:
                    pass
        await session.commit()

    try:
        await evaluate_alerts(all_metrics, device_map, redis_client)
    except Exception as e:
        log.error(f"  Alert evaluation error: {e}")

    for update in status_updates:
        dev_id = update["device_id"]
        dev, _ = device_map[dev_id]
        agg = {m["metric_name"]: m["metric_value"] for m in update["metrics"] if not m.get("labels")}
        payload = {
            "type": "poll_result", "device_id": dev_id, "ip_address": dev.ip_address,
            "hostname": dev.hostname, "status": update["status"],
            "timestamp": datetime.now(timezone.utc).isoformat(), "metrics": agg,
        }
        try:
            await redis_client.publish("nms_realtime", json.dumps(payload))
        except Exception as e:
            log.warning(f"  Redis publish failed: {e}")

    elapsed = time.monotonic() - cycle_start
    up = sum(1 for u in status_updates if u["status"] == "up")
    down = sum(1 for u in status_updates if u["status"] == "down")
    log.info(f"  Cycle complete in {elapsed:.1f}s -- {up} up, {down} down, {len(all_metrics)} metrics")


async def main(interval: int):
    log.info(f"Poller starting (interval={interval}s)")
    redis_client = aioredis.from_url(settings.REDIS_URL)
    try:
        await redis_client.ping()
        log.info("Redis connected")
    except Exception as e:
        log.warning(f"Redis unavailable ({e})")

    while True:
        try:
            await run_poll_cycle(redis_client)
        except Exception as e:
            log.error(f"Poll cycle error: {e}")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NMS SNMP Poller")
    parser.add_argument("--interval", type=int, default=settings.POLL_INTERVAL_SECONDS)
    args = parser.parse_args()
    asyncio.run(main(args.interval))
