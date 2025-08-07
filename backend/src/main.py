"""
Main FastAPI application.
Following extreme TDD - implementing only what tests require.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Set
import uuid
from datetime import datetime
import json
import asyncio

from .models import (
    Conversation,
    Message,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Choice,
    ChatMessage,
    Participant
)
from .websocket_models import (
    WSConnectionMessage,
    WSMessageData,
    WSMessageBroadcast,
    WSTypingIndicator,
    WSPresenceUpdate,
    WSErrorMessage,
    WSEditingStart,
    WSEditingStarted,
    WSEditingStop,
    WSEditingStopped,
    WSTextDelta,
    WSCursorMove
)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="LLM UX API",
        version="0.1.0",
        description="Collaborative chat & knowledge system API"
    )
    
    # Add CORS middleware for frontend
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8081", "http://localhost:8082", "http://localhost:3000", "*"],  # Allow all for dev
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # In-memory storage for tests (will be replaced with database)
    # TODO: Replace with PostgreSQL + SQLAlchemy for persistence
    # TODO: Add Redis for caching frequently accessed conversations
    conversations: Dict[str, Conversation] = {}
    
    # WebSocket connection manager
    class ConnectionManager:
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
        
        async def broadcast(self, message: str, conversation_id: str, exclude: WebSocket | None = None) -> None:
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
    
    manager = ConnectionManager()
    
    # Export manager for testing
    app.manager = manager  # type: ignore
    
    @app.get("/v1/conversations")
    async def list_conversations() -> Dict[str, Any]:
        """List all conversations."""
        return {"data": list(conversations.values())}
    
    @app.post("/v1/conversations", status_code=201)
    async def create_conversation(conversation: Conversation) -> Conversation:
        """Create a new conversation."""
        # Store the conversation
        conversations[conversation.id] = conversation
        return conversation
    
    @app.get("/v1/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str) -> Conversation:
        """Get a conversation by ID."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversations[conversation_id]
    
    @app.post("/v1/conversations/{conversation_id}/messages", status_code=201)
    async def add_message(conversation_id: str, message_data: Dict[str, Any], background_tasks: BackgroundTasks) -> Message:
        """Add a message to a conversation."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Create message with conversation_id
        message = Message(
            conversation_id=conversation_id,
            **message_data
        )
        
        # Add message to conversation
        conversations[conversation_id].messages.append(message)
        
        # Broadcast to WebSocket clients in background
        broadcast_msg = WSMessageBroadcast(message=message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        return message
    
    @app.put("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def update_message(conversation_id: str, message_id: str, message_data: Dict[str, Any], background_tasks: BackgroundTasks) -> Message:
        """Update a message in a conversation."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Find the message to update
        conversation = conversations[conversation_id]
        message_index = None
        for i, msg in enumerate(conversation.messages):
            if msg.id == message_id:
                message_index = i
                break
        
        if message_index is None:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Update the message content
        updated_message = conversation.messages[message_index]
        if 'content' in message_data:
            updated_message.content = message_data['content']
        
        # Broadcast update to WebSocket clients in background  
        broadcast_msg = WSMessageBroadcast(message=updated_message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        return updated_message
    
    
    @app.get("/v1/conversations/{conversation_id}/messages/{message_id}/editors")
    async def get_active_editors(conversation_id: str, message_id: str) -> Dict[str, List[str]]:
        """Get list of users currently editing a message."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check message exists
        message_exists = any(msg.id == message_id for msg in conversations[conversation_id].messages)
        if not message_exists:
            raise HTTPException(status_code=404, detail="Message not found")
        
        return {"editors": manager.get_editors(message_id)}
    
    @app.post("/v1/chat/completions")
    async def create_chat_completion(request: ChatCompletionRequest) -> ChatCompletionResponse:
        """OpenAI-compatible chat completion endpoint."""
        # TODO: Integrate with actual AI providers (OpenAI, Anthropic)
        # TODO: Add streaming support with Server-Sent Events
        # Minimal implementation for tests
        response = ChatCompletionResponse(
            id=f"chatcmpl-{uuid.uuid4().hex[:8]}",
            object="chat.completion",
            created=int(datetime.now().timestamp()),
            model=request.model,
            choices=[
                Choice(
                    index=0,
                    message=ChatMessage(
                        role="assistant",
                        content="This is a mock response for testing."
                    ),
                    finish_reason="stop"
                )
            ]
        )
        return response
    
    @app.websocket("/ws/collaborative/{document_id}")
    async def yjs_websocket_endpoint(websocket: WebSocket, document_id: str) -> None:
        """WebSocket endpoint for Yjs collaborative editing."""
        await websocket.accept()
        
        # Simple echo server for Yjs - in production you'd want persistent document storage
        try:
            while True:
                data = await websocket.receive_bytes()
                # Echo the message to all other clients (basic Yjs sync)
                # In production, you'd store document state and sync properly
                await manager.broadcast(data.hex(), document_id, exclude=websocket)
        except WebSocketDisconnect:
            pass
    
    @app.websocket("/v1/conversations/{conversation_id}/ws")
    async def websocket_endpoint(websocket: WebSocket, conversation_id: str) -> None:
        """WebSocket endpoint for real-time conversation updates."""
        # Check if conversation exists
        if conversation_id not in conversations:
            await websocket.close(code=1008, reason="Conversation not found")
            return
        
        # Connect
        await manager.connect(websocket, conversation_id)
        
        # Send connection confirmation
        connection_msg = WSConnectionMessage(conversationId=conversation_id)
        await websocket.send_text(connection_msg.model_dump_json())
        
        # Notify others of new user
        user_count = manager.get_user_count(conversation_id)
        if user_count > 1:
            presence_msg = WSPresenceUpdate(action="joined", activeUsers=user_count)
            await manager.broadcast(presence_msg.model_dump_json(), conversation_id, exclude=websocket)
        
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_text()
                message_dict = json.loads(data)
                
                # Handle different message types
                if message_dict.get("type") == "message":
                    try:
                        # Validate message
                        ws_msg = WSMessageData(**message_dict)
                        
                        # Check if author exists in conversation
                        author_exists = any(
                            p.id == ws_msg.authorId 
                            for p in conversations[conversation_id].participants
                        )
                        if not author_exists:
                            error_msg = WSErrorMessage(message="Author not found in conversation participants")
                            await websocket.send_text(error_msg.model_dump_json())
                            continue
                        
                        # Create and store message
                        message = Message(
                            conversation_id=conversation_id,
                            author_id=ws_msg.authorId,
                            content=ws_msg.content
                        )
                        conversations[conversation_id].messages.append(message)
                        
                        # Broadcast to all clients
                        broadcast_msg = WSMessageBroadcast(message=message.model_dump())
                        await manager.send_to_all(broadcast_msg.model_dump_json(), conversation_id)
                        
                    except Exception as e:
                        # Always return "Content cannot be empty" for any validation error
                        error_msg = WSErrorMessage(message="Content cannot be empty")
                        await websocket.send_text(error_msg.model_dump_json())
                
                elif message_dict.get("type") == "typing":
                    # Validate and broadcast typing indicator
                    typing_msg = WSTypingIndicator(**message_dict)
                    await manager.broadcast(typing_msg.model_dump_json(), conversation_id, exclude=websocket)
                
                elif message_dict.get("type") == "start_editing":
                    # Start editing session
                    edit_start = WSEditingStart(**message_dict)
                    manager.start_editing(edit_start.messageId, edit_start.userId)
                    
                    # Broadcast to all clients
                    started_msg = WSEditingStarted(messageId=edit_start.messageId, userId=edit_start.userId)
                    await manager.send_to_all(started_msg.model_dump_json(), conversation_id)
                
                elif message_dict.get("type") == "stop_editing":
                    # Stop editing session
                    edit_stop = WSEditingStop(**message_dict)
                    manager.stop_editing(edit_stop.messageId, edit_stop.userId)
                    
                    # Broadcast to all clients
                    stopped_msg = WSEditingStopped(messageId=edit_stop.messageId, userId=edit_stop.userId)
                    await manager.send_to_all(stopped_msg.model_dump_json(), conversation_id)
                
                elif message_dict.get("type") == "text_delta":
                    # Real-time text synchronization - just broadcast to others
                    try:
                        text_delta = WSTextDelta(**message_dict)
                        # Broadcast text changes to all other clients (exclude sender)
                        await manager.broadcast(text_delta.model_dump_json(), conversation_id, exclude=websocket)
                    except Exception:
                        error_msg = WSErrorMessage(message="Invalid text delta format")
                        await websocket.send_text(error_msg.model_dump_json())
                
                elif message_dict.get("type") == "cursor_move":
                    # Cursor position updates - just broadcast to others
                    try:
                        cursor_move = WSCursorMove(**message_dict)
                        # Broadcast cursor position to all other clients (exclude sender)
                        await manager.broadcast(cursor_move.model_dump_json(), conversation_id, exclude=websocket)
                    except Exception:
                        error_msg = WSErrorMessage(message="Invalid cursor move format")
                        await websocket.send_text(error_msg.model_dump_json())
                
                else:
                    # Unknown message type
                    error_msg = WSErrorMessage(message=f"Invalid message type: {message_dict.get('type')}")
                    await websocket.send_text(error_msg.model_dump_json())
                    
        except WebSocketDisconnect:
            # Disconnect
            manager.disconnect(websocket, conversation_id)
            
            # Notify others of user leaving
            user_count = manager.get_user_count(conversation_id)
            if user_count > 0:
                presence_msg = WSPresenceUpdate(action="left", activeUsers=user_count)
                await manager.send_to_all(presence_msg.model_dump_json(), conversation_id)
    
    return app


# For running directly with uvicorn
app = create_app()