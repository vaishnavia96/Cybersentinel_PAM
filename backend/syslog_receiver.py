"""
Standalone async syslog receiver daemon (UDP port 514).

Run:  sudo python syslog_receiver.py
      sudo python syslog_receiver.py --port 1514   (non-privileged port for testing)

Architecture:
  1. Binds a UDP socket on port 514 (or configurable).
  2. Parses incoming RFC 3164 / RFC 5424 syslog messages.
  3. Correlates source IP with devices table.
  4. Stores parsed log in syslogs table.
  5. Evaluates severity for alert generation.
  6. Publishes alerts to Redis Pub/Sub "nms_realtime".
"""

import argparse
import asyncio
import json
import logging
import re
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.device import Device
from app.models.syslog import Syslog
from app.models.active_alert import ActiveAlert
from app.models.alert_rule import AlertRule

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("syslog_receiver")

SEVERITY_NAMES = {
    0: "emergency", 1: "alert", 2: "critical", 3: "error",
    4: "warning", 5: "notice", 6: "info", 7: "debug",
}
SEVERITY_LEVELS = {v: k for k, v in SEVERITY_NAMES.items()}

# RFC 3164 pattern: <PRI>TIMESTAMP HOSTNAME MSG
RFC3164_RE = re.compile(
    r"<(\d{1,3})>"
    r"(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})?\s*"
    r"(\S+)?\s*"
    r"(.*)"
)

# Device IP cache to avoid constant DB lookups
_device_cache: dict[str, int] = {}
_cache_expiry = 0


async def refresh_device_cache():
    global _device_cache, _cache_expiry
    now = asyncio.get_event_loop().time()
    if now < _cache_expiry:
        return
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Device.id, Device.ip_address))
        _device_cache = {row.ip_address: row.id for row in result}
    _cache_expiry = now + 60  # refresh every 60s


def parse_syslog(data: bytes, source_ip: str) -> dict | None:
    try:
        text = data.decode("utf-8", errors="replace").strip()
    except Exception:
        return None

    m = RFC3164_RE.match(text)
    if not m:
        return {
            "facility": 1,
            "severity_num": 6,
            "severity": "info",
            "hostname": source_ip,
            "message": text,
        }

    pri = int(m.group(1))
    facility = pri >> 3
    severity_num = pri & 0x07
    severity = SEVERITY_NAMES.get(severity_num, "info")
    hostname = m.group(3) or source_ip
    message = m.group(4) or ""

    return {
        "facility": facility,
        "severity_num": severity_num,
        "severity": severity,
        "hostname": hostname,
        "message": message.strip(),
    }


async def process_syslog(source_ip: str, parsed: dict, redis_client: aioredis.Redis):
    await refresh_device_cache()

    device_id = _device_cache.get(source_ip)
    if device_id is None:
        # Auto-register unknown source as new device
        async with AsyncSessionLocal() as session:
            dev = Device(ip_address=source_ip, hostname=parsed.get("hostname"), status="up")
            session.add(dev)
            await session.commit()
            await session.refresh(dev)
            device_id = dev.id
            _device_cache[source_ip] = device_id
            log.info(f"Auto-registered device {source_ip} (id={device_id})")

    now = datetime.now(timezone.utc)

    # Store syslog
    async with AsyncSessionLocal() as session:
        syslog_entry = Syslog(
            timestamp=now,
            device_id=device_id,
            facility=parsed["facility"],
            severity=parsed["severity"],
            message=parsed["message"],
        )
        session.add(syslog_entry)
        await session.commit()

    # Evaluate alert conditions
    alert_generated = False
    severity_num = parsed["severity_num"]

    if severity_num <= 3:  # error, critical, alert, emergency
        async with AsyncSessionLocal() as session:
            alert = ActiveAlert(
                device_id=device_id,
                alert_rule_id=None,
                message=f"Syslog {parsed['severity'].upper()}: {parsed['message'][:200]}",
                severity="critical" if severity_num <= 2 else "warning",
                triggered_at=now,
            )
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
            alert_generated = True

            payload = {
                "type": "alert",
                "alert_id": alert.id,
                "device_id": device_id,
                "ip_address": source_ip,
                "severity": alert.severity,
                "message": alert.message,
                "triggered_at": now.isoformat(),
                "source": "syslog",
            }
            try:
                await redis_client.publish("nms_realtime", json.dumps(payload))
            except Exception:
                pass

    # Always publish syslog event for live feed
    syslog_payload = {
        "type": "syslog",
        "device_id": device_id,
        "ip_address": source_ip,
        "severity": parsed["severity"],
        "message": parsed["message"][:500],
        "timestamp": now.isoformat(),
    }
    try:
        await redis_client.publish("nms_realtime", json.dumps(syslog_payload))
    except Exception:
        pass

    if alert_generated:
        log.warning(f"ALERT from {source_ip}: {parsed['severity']} — {parsed['message'][:80]}")


class SyslogProtocol(asyncio.DatagramProtocol):
    def __init__(self, redis_client: aioredis.Redis, loop: asyncio.AbstractEventLoop):
        self.redis_client = redis_client
        self.loop = loop

    def datagram_received(self, data: bytes, addr: tuple):
        source_ip = addr[0]
        parsed = parse_syslog(data, source_ip)
        if parsed:
            self.loop.create_task(process_syslog(source_ip, parsed, self.redis_client))

    def error_received(self, exc):
        log.error(f"UDP error: {exc}")


async def main(port: int):
    log.info(f"Syslog receiver starting on UDP port {port}")
    redis_client = aioredis.from_url(settings.REDIS_URL)

    try:
        await redis_client.ping()
        log.info("Redis connected")
    except Exception as e:
        log.warning(f"Redis unavailable ({e})")

    loop = asyncio.get_running_loop()
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: SyslogProtocol(redis_client, loop),
        local_addr=("0.0.0.0", port),
    )

    log.info(f"Listening for syslog on UDP 0.0.0.0:{port}")
    try:
        await asyncio.sleep(float("inf"))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        transport.close()
        await redis_client.close()
        log.info("Syslog receiver stopped")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NMS Syslog Receiver")
    parser.add_argument("--port", type=int, default=514)
    args = parser.parse_args()
    asyncio.run(main(args.port))
