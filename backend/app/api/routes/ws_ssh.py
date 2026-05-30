import asyncio

import paramiko
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import decode_access_token, decrypt_value
from app.models.device import Device
from app.models.credential import Credential
from app.models.device_credential import device_credentials

router = APIRouter()


def _decrypt_field(val: str | None) -> str | None:
    if not val:
        return None
    try:
        return decrypt_value(val)
    except Exception:
        return val


async def _get_device_ssh(device_id: int):
    async with AsyncSessionLocal() as session:
        dev_r = await session.execute(select(Device).where(Device.id == device_id))
        device = dev_r.scalar_one_or_none()
        if not device:
            return None, None

        cred_r = await session.execute(
            select(Credential)
            .join(device_credentials, Credential.id == device_credentials.c.credential_id)
            .where(device_credentials.c.device_id == device_id)
            .where(Credential.type == "ssh")
        )
        cred = cred_r.scalar_one_or_none()
        return device, cred


@router.websocket("/ws/ssh/{device_id}")
async def ws_ssh(
    ws: WebSocket,
    device_id: int,
    token: str = Query(""),
    ssh_user: str = Query(""),
    ssh_pass: str = Query(""),
):
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await ws.close(code=4001, reason="Invalid token")
        return

    await ws.accept()

    device, cred = await _get_device_ssh(device_id)
    if not device:
        await ws.send_text("\r\n\x1b[31mError: Device not found.\x1b[0m\r\n")
        await ws.close()
        return

    # Use inline credentials if provided, otherwise fall back to saved profile
    if ssh_user:
        username = ssh_user
        password = ssh_pass
    elif cred:
        username = cred.username or "admin"
        password = _decrypt_field(cred.password) or ""
    else:
        await ws.send_text("\r\n\x1b[31mError: No SSH credentials provided and none saved for this device.\x1b[0m\r\n")
        await ws.close()
        return

    host = device.ip_address
    await ws.send_text(f"\r\nConnecting to {host} as {username}...\r\n")

    ssh_client = paramiko.SSHClient()
    ssh_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(
            None,
            lambda: ssh_client.connect(
                hostname=host,
                username=username,
                password=password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
            ),
        )
    except Exception as e:
        await ws.send_text(f"\r\n\x1b[31mSSH connection failed: {e}\x1b[0m\r\n")
        await ws.close()
        return

    chan = await loop.run_in_executor(
        None,
        lambda: ssh_client.invoke_shell(term="xterm", width=120, height=40),
    )

    await ws.send_text("\r\n\x1b[32mConnected.\x1b[0m\r\n")

    async def ssh_to_ws():
        try:
            while True:
                data = await loop.run_in_executor(None, lambda: chan.recv(4096) if chan.recv_ready() else b"")
                if data:
                    await ws.send_text(data.decode("utf-8", errors="replace"))
                else:
                    if chan.exit_status_ready():
                        break
                    await asyncio.sleep(0.05)
        except Exception:
            pass

    async def ws_to_ssh():
        try:
            while True:
                msg = await ws.receive_text()
                await loop.run_in_executor(None, lambda m=msg: chan.send(m.encode()))
        except WebSocketDisconnect:
            pass
        except Exception:
            pass

    try:
        await asyncio.gather(ssh_to_ws(), ws_to_ssh())
    finally:
        chan.close()
        ssh_client.close()
