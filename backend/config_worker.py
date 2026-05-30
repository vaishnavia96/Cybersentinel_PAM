"""
Configuration Backup Engine.

Run standalone:   python config_worker.py <device_id>
Or imported by FastAPI for on-demand backup.

Pipeline:
  1. Load device + SSH credentials from DB.
  2. Decrypt credential secrets with Fernet.
  3. Determine vendor device_type for Netmiko.
  4. SSH connect → execute "show running-config" (or equivalent).
  5. Compute SHA-256 checksum of the output.
  6. Compare with last known checksum — skip if unchanged.
  7. Save to ./storage/configs/device_<id>/<timestamp>.cfg
  8. Insert config_metadata row.
"""

import asyncio
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_value
from app.models.device import Device
from app.models.credential import Credential
from app.models.device_credential import device_credentials
from app.models.config_metadata import ConfigMetadata

STORAGE_BASE = Path(__file__).parent / "storage" / "configs"

# Vendor → Netmiko device_type mapping
VENDOR_TYPE_MAP = {
    "cisco": "cisco_ios",
    "juniper": "juniper_junos",
    "arista": "arista_eos",
    "huawei": "huawei",
    "mikrotik": "mikrotik_routeros",
    "linux": "linux",
    "fortinet": "fortinet",
    "palo alto": "paloalto_panos",
}

# Vendor → config command mapping
VENDOR_CMD_MAP = {
    "cisco_ios": "show running-config",
    "cisco_xe": "show running-config",
    "cisco_nxos": "show running-config",
    "juniper_junos": "show configuration | display set",
    "arista_eos": "show running-config",
    "huawei": "display current-configuration",
    "mikrotik_routeros": "/export",
    "linux": "cat /etc/network/interfaces 2>/dev/null; ip addr show",
    "fortinet": "show full-configuration",
    "paloalto_panos": "show config running",
}


def determine_device_type(vendor: str | None) -> str:
    if not vendor:
        return "linux"
    v = vendor.lower()
    for pattern, dtype in VENDOR_TYPE_MAP.items():
        if pattern in v:
            return dtype
    return "linux"


def get_config_command(device_type: str) -> str:
    return VENDOR_CMD_MAP.get(device_type, "show running-config")


def compute_checksum(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def decrypt_credential_field(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return decrypt_value(value)
    except Exception:
        return value


async def get_device_with_ssh_cred(device_id: int) -> tuple[Device | None, Credential | None]:
    async with AsyncSessionLocal() as session:
        dev_result = await session.execute(select(Device).where(Device.id == device_id))
        device = dev_result.scalar_one_or_none()
        if not device:
            return None, None

        cred_result = await session.execute(
            select(Credential)
            .join(device_credentials, Credential.id == device_credentials.c.credential_id)
            .where(device_credentials.c.device_id == device_id)
            .where(Credential.type == "ssh")
        )
        cred = cred_result.scalar_one_or_none()
        return device, cred


def run_ssh_backup(ip: str, device_type: str, username: str, password: str) -> str:
    """Execute Netmiko SSH connection and fetch config. Runs in thread pool."""
    from netmiko import ConnectHandler

    conn_params = {
        "device_type": device_type,
        "host": ip,
        "username": username,
        "password": password,
        "timeout": 30,
        "conn_timeout": 15,
    }
    with ConnectHandler(**conn_params) as conn:
        command = get_config_command(device_type)
        output = conn.send_command(command, read_timeout=60)
    return output


async def backup_device(device_id: int) -> dict:
    """
    Main entry point — backs up a single device's configuration.
    Returns a result dict with status info.
    """
    device, cred = await get_device_with_ssh_cred(device_id)

    if not device:
        return {"status": "error", "detail": f"Device {device_id} not found"}
    if not cred:
        return {"status": "error", "detail": f"No SSH credential for device {device_id}"}

    username = cred.username or "admin"
    password = decrypt_credential_field(cred.password) or ""
    device_type = determine_device_type(device.vendor)

    # Run SSH in a thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    try:
        config_text = await loop.run_in_executor(
            None, run_ssh_backup, device.ip_address, device_type, username, password
        )
    except Exception as e:
        return {"status": "error", "detail": f"SSH failed: {str(e)[:200]}"}

    if not config_text or len(config_text.strip()) < 10:
        return {"status": "error", "detail": "Empty or minimal config received"}

    # Compute checksum and compare with last known
    checksum = compute_checksum(config_text)

    async with AsyncSessionLocal() as session:
        last = await session.execute(
            select(ConfigMetadata)
            .where(ConfigMetadata.device_id == device_id)
            .order_by(ConfigMetadata.backup_timestamp.desc())
            .limit(1)
        )
        last_meta = last.scalar_one_or_none()

        if last_meta and last_meta.checksum == checksum:
            return {
                "status": "unchanged",
                "detail": "Config unchanged since last backup",
                "checksum": checksum,
                "last_backup": last_meta.backup_timestamp.isoformat(),
            }

    # Save to filesystem
    now = datetime.now(timezone.utc)
    device_dir = STORAGE_BASE / f"device_{device_id}"
    device_dir.mkdir(parents=True, exist_ok=True)
    filename = now.strftime("%Y%m%d_%H%M%S") + ".cfg"
    file_path = device_dir / filename
    file_path.write_text(config_text, encoding="utf-8")

    # Insert metadata
    relative_path = str(file_path.relative_to(Path(__file__).parent))
    async with AsyncSessionLocal() as session:
        meta = ConfigMetadata(
            device_id=device_id,
            file_path=relative_path,
            checksum=checksum,
            backup_timestamp=now,
        )
        session.add(meta)
        await session.commit()

    return {
        "status": "saved",
        "detail": f"Config backed up ({len(config_text)} bytes)",
        "checksum": checksum,
        "file_path": relative_path,
        "file_size": len(config_text),
    }


async def main():
    device_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    print(f"Backing up device {device_id}...")
    result = await backup_device(device_id)
    print(f"Result: {result}")


if __name__ == "__main__":
    asyncio.run(main())
