"""
Automatic topology discovery — LibreNMS-style hierarchical map.

Builds a proper network tree by identifying gateway/infrastructure nodes
(routers, switches) and connecting endpoints to their nearest gateway.

Methods:
  1. Walk ARP tables on SNMP-enabled devices to find directly-connected neighbors
  2. Use default gateway detection to identify infrastructure vs endpoints
  3. LLDP for direct switch-to-switch links
  4. Build a hub-and-spoke tree, not a full mesh
"""

import asyncio
import logging
from collections import defaultdict

import aiosnmp
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_value
from app.models.device import Device
from app.models.credential import Credential
from app.models.device_credential import device_credentials
from app.models.topology_link import TopologyLink

log = logging.getLogger("topology_discovery")

ARP_TABLE_IP = "1.3.6.1.2.1.4.22.1.3"
LLDP_REM_SYS_NAME = "1.0.8802.1.1.2.1.4.1.1.9"
LLDP_REM_PORT_DESC = "1.0.8802.1.1.2.1.4.1.1.8"
IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
DEFAULT_ROUTE_NEXTHOP = "1.3.6.1.2.1.4.21.1.7"  # ipRouteNextHop


def _val(r):
    v = r.value
    if v is None:
        return None
    return v.decode("utf-8", errors="replace") if isinstance(v, bytes) else str(v)


async def _walk(ip, community, oid):
    try:
        async with aiosnmp.Snmp(host=ip, community=community, port=161, timeout=3, retries=1) as snmp:
            return await snmp.walk(oid)
    except Exception:
        return []


async def probe_device(dev_ip, community):
    """Get ARP neighbors, LLDP peers, default gateway, and interfaces for one device."""
    arp_ips = set()
    lldp_peers = []
    gateway = None
    interfaces = {}

    # ARP table
    for r in await _walk(dev_ip, community, ARP_TABLE_IP):
        ip = _val(r)
        if ip and ip != dev_ip and not ip.startswith("127.") and not ip.startswith("224."):
            arp_ips.add(ip)

    # LLDP neighbors
    lldp_names = await _walk(dev_ip, community, LLDP_REM_SYS_NAME)
    lldp_ports = await _walk(dev_ip, community, LLDP_REM_PORT_DESC)
    for i, r in enumerate(lldp_names):
        name = _val(r)
        port = _val(lldp_ports[i]) if i < len(lldp_ports) else None
        if name:
            lldp_peers.append({"hostname": name, "port": port})

    # Default gateway (route to 0.0.0.0)
    for r in await _walk(dev_ip, community, DEFAULT_ROUTE_NEXTHOP):
        gw = _val(r)
        if gw and gw != "0.0.0.0" and gw != dev_ip:
            gateway = gw
            break

    # Interface names
    for r in await _walk(dev_ip, community, IF_DESCR):
        idx = str(r.oid).rsplit(".", 1)[-1]
        interfaces[idx] = _val(r)

    return {"arp": arp_ips, "lldp": lldp_peers, "gateway": gateway, "interfaces": interfaces}


async def run_topology_discovery():
    """Build a hierarchical topology map."""
    log.info("Starting topology discovery...")

    # Load SNMP-enabled devices
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Device, Credential)
            .join(device_credentials, Device.id == device_credentials.c.device_id)
            .join(Credential, Credential.id == device_credentials.c.credential_id)
            .where(Credential.type.in_(["snmp_v2c", "snmp_v3"]))
            .where(Device.snmp_status == "on")
        )
        rows = result.all()

    snmp_devices = {}
    for dev, cred in rows:
        if dev.id not in snmp_devices and cred.community_string:
            try:
                community = decrypt_value(cred.community_string)
            except Exception:
                community = cred.community_string
            snmp_devices[dev.id] = (dev, community)

    # Load ALL devices
    async with AsyncSessionLocal() as session:
        all_devs = (await session.execute(select(Device))).scalars().all()

    ip_to_dev = {d.ip_address: d for d in all_devs}
    hostname_to_dev = {d.hostname.lower(): d for d in all_devs if d.hostname}

    if not snmp_devices:
        return {"discovered": 0, "detail": "No SNMP-enabled devices"}

    # Probe all SNMP devices concurrently
    probe_tasks = {did: asyncio.create_task(probe_device(dev.ip_address, comm)) for did, (dev, comm) in snmp_devices.items()}
    probes = {}
    for did, task in probe_tasks.items():
        probes[did] = await task

    # Score each device: devices that appear in many ARP tables are infrastructure (switches/routers)
    # The more devices know about you, the more central you are
    arp_appearance_count = defaultdict(int)
    for did, data in probes.items():
        for neighbor_ip in data["arp"]:
            if neighbor_ip in ip_to_dev:
                arp_appearance_count[ip_to_dev[neighbor_ip].id] += 1

    # Also, SNMP-enabled devices with large ARP tables are infrastructure
    for did, data in probes.items():
        arp_appearance_count[did] += len(data["arp"]) // 5  # bonus for large ARP tables

    # Identify infrastructure nodes: devices that are gateways or have high ARP appearance
    gateway_ips = {data["gateway"] for data in probes.values() if data.get("gateway")}
    infra_ids = set()
    for dev in all_devs:
        if dev.ip_address in gateway_ips:
            infra_ids.add(dev.id)
        if arp_appearance_count.get(dev.id, 0) >= 3:
            infra_ids.add(dev.id)
    # All SNMP devices are at least semi-infrastructure
    for did in snmp_devices:
        infra_ids.add(did)

    links = set()  # (src_id, tgt_id, src_if, tgt_if)

    # 1. LLDP links: direct switch-to-switch (highest quality)
    for did, data in probes.items():
        for peer in data["lldp"]:
            hostname = peer.get("hostname", "").lower()
            if hostname in hostname_to_dev:
                target = hostname_to_dev[hostname]
                key = (min(did, target.id), max(did, target.id))
                links.add((*key, None, peer.get("port")))

    # 2. ARP-based: connect each device to the SNMP device that sees it
    #    This creates a hub-spoke: SNMP device (switch/router) → neighbors
    for did, data in probes.items():
        dev, _ = snmp_devices[did]
        for neighbor_ip in data["arp"]:
            if neighbor_ip in ip_to_dev:
                target = ip_to_dev[neighbor_ip]
                if target.id == did:
                    continue
                key = (min(did, target.id), max(did, target.id))
                links.add((*key, None, None))

    # 3. Gateway links: connect each SNMP device to its default gateway
    for did, data in probes.items():
        gw_ip = data.get("gateway")
        if gw_ip and gw_ip in ip_to_dev:
            gw_dev = ip_to_dev[gw_ip]
            key = (min(did, gw_dev.id), max(did, gw_dev.id))
            links.add((*key, None, None))

    # 4. For non-SNMP devices that aren't in any ARP table,
    #    connect them to the gateway that most SNMP devices point to
    connected_ids = set()
    for src, tgt, _, _ in links:
        connected_ids.add(src)
        connected_ids.add(tgt)

    # Find the most common gateway
    primary_gw = None
    gw_counts = defaultdict(int)
    for data in probes.values():
        if data.get("gateway") and data["gateway"] in ip_to_dev:
            gw_counts[ip_to_dev[data["gateway"]].id] += 1
    if gw_counts:
        primary_gw = max(gw_counts, key=gw_counts.get)

    if primary_gw:
        for dev in all_devs:
            if dev.id not in connected_ids and dev.id != primary_gw:
                key = (min(dev.id, primary_gw), max(dev.id, primary_gw))
                links.add((*key, None, None))

    # Write to DB
    created = 0
    async with AsyncSessionLocal() as session:
        old = await session.execute(select(TopologyLink).where(TopologyLink.link_type == "discovered"))
        for link in old.scalars().all():
            await session.delete(link)

        for src, tgt, src_if, tgt_if in links:
            session.add(TopologyLink(
                source_device_id=src, target_device_id=tgt,
                source_interface=src_if, target_interface=tgt_if,
                link_type="discovered",
            ))
            created += 1
        await session.commit()

    log.info(f"Topology: {created} links, {len(infra_ids)} infra nodes, {len(snmp_devices)} probed")
    return {
        "discovered": created,
        "devices_scanned": len(snmp_devices),
        "infra_nodes": len(infra_ids),
        "methods": ["arp", "lldp", "gateway"],
    }
