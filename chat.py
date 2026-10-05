import logging
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger("athenaeum.chat")


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    user_id: int


class ConnectionManager:
    """Tracks live WebSocket connections per group, in-memory.

    Single-process only — fine for one `uv run fastapi dev` worker, but a
    second worker/process wouldn't see the other's connections. A real
    deployment with multiple workers needs a pub/sub broker (Redis) in front
    of this; not needed at this project's current scale.

    Robustness rules: `disconnect` is idempotent, `broadcast` works on a
    snapshot and prunes peers that fail to receive (so one dead socket can
    never break the sender or skip healthy peers), and connections remember
    their user so leaving or deleting a group can close the right sockets.
    """

    def __init__(self):
        self.active_connections: dict[int, list[Connection]] = {}

    def connect(self, group_id: int, websocket: WebSocket, user_id: int = 0) -> None:
        self.active_connections.setdefault(group_id, []).append(Connection(websocket, user_id))

    def disconnect(self, group_id: int, websocket: WebSocket) -> None:
        connections = self.active_connections.get(group_id)
        if not connections:
            return
        remaining = [c for c in connections if c.websocket is not websocket]
        if remaining:
            self.active_connections[group_id] = remaining
        else:
            self.active_connections.pop(group_id, None)

    def count(self, group_id: int) -> int:
        return len(self.active_connections.get(group_id, []))

    async def broadcast(self, group_id: int, message: dict) -> None:
        dead: list[WebSocket] = []
        for connection in list(self.active_connections.get(group_id, [])):
            try:
                await connection.websocket.send_json(message)
            except Exception:
                logger.info("dropping dead chat peer in group %s", group_id)
                dead.append(connection.websocket)
        for websocket in dead:
            self.disconnect(group_id, websocket)

    async def close_user(self, group_id: int, user_id: int, code: int = 4403) -> None:
        """Close every socket this user has open in the group (e.g. after leaving)."""
        for connection in list(self.active_connections.get(group_id, [])):
            if connection.user_id == user_id:
                await self._close(group_id, connection.websocket, code)

    async def close_group(self, group_id: int, code: int = 4404) -> None:
        """Close every socket in the group (e.g. after it is deleted)."""
        for connection in list(self.active_connections.get(group_id, [])):
            await self._close(group_id, connection.websocket, code)

    async def _close(self, group_id: int, websocket: WebSocket, code: int) -> None:
        try:
            await websocket.close(code=code)
        except Exception:
            pass
        self.disconnect(group_id, websocket)


manager = ConnectionManager()
