"""WebSocket connection manager."""
from typing import Dict, List, Set, Optional
from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""
    
    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_count: Dict[str, int] = {}
        self.editing_sessions: Dict[str, Set[str]] = {}  # messageId -> set of userIds
    
    async def connect(self, websocket: WebSocket, conversation_id: str) -> None:
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = []
            self.user_count[conversation_id] = 0
        self.active_connections[conversation_id].append(websocket)
        self.user_count[conversation_id] += 1
    
    def start_editing(self, message_id: str, user_id: str) -> None:
        if message_id not in self.editing_sessions:
            self.editing_sessions[message_id] = set()
        self.editing_sessions[message_id].add(user_id)
    
    def stop_editing(self, message_id: str, user_id: str) -> None:
        if message_id in self.editing_sessions:
            self.editing_sessions[message_id].discard(user_id)
            if not self.editing_sessions[message_id]:
                del self.editing_sessions[message_id]
    
    def get_editors(self, message_id: str) -> List[str]:
        return list(self.editing_sessions.get(message_id, set()))
        
    def disconnect(self, websocket: WebSocket, conversation_id: str) -> None:
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].remove(websocket)
            self.user_count[conversation_id] -= 1
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]
                del self.user_count[conversation_id]
    
    async def broadcast(self, message: str, conversation_id: str, exclude: Optional[WebSocket] = None) -> None:
        if conversation_id in self.active_connections:
            connections_to_remove = []
            for connection in self.active_connections[conversation_id]:
                if connection != exclude:
                    try:
                        await connection.send_text(message)
                    except Exception:
                        # Connection is closed, mark for removal
                        connections_to_remove.append(connection)
            
            # Remove closed connections
            for conn in connections_to_remove:
                self.disconnect(conn, conversation_id)
    
    async def send_to_all(self, message: str, conversation_id: str) -> None:
        if conversation_id in self.active_connections:
            connections_to_remove = []
            for connection in self.active_connections[conversation_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    # Connection is closed, mark for removal
                    connections_to_remove.append(connection)
            
            # Remove closed connections
            for conn in connections_to_remove:
                self.disconnect(conn, conversation_id)
    
    def get_user_count(self, conversation_id: str) -> int:
        return self.user_count.get(conversation_id, 0)