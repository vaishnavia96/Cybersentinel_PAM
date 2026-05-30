import asyncio
import json

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings

router = APIRouter()


@router.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()

    redis_client = aioredis.from_url(settings.REDIS_URL)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("nms_realtime")

    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg["type"] == "message":
                data = msg["data"]
                if isinstance(data, bytes):
                    data = data.decode()
                await ws.send_text(data)
            else:
                await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await pubsub.unsubscribe("nms_realtime")
        await pubsub.close()
        await redis_client.close()
