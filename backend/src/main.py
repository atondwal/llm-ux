"""
Main FastAPI application.
Following extreme TDD - implementing only what tests require.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Set
import uuid
from datetime import datetime
import json

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
    WSMessageEditedBroadcast,
    WSTypingIndicator,
    WSPresenceUpdate,
    WSErrorMessage
)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="LLM UX API",
        version="0.1.0",
        description="Collaborative chat & knowledge system API"
    )
    
    # In-memory storage for tests (will be replaced with database)
    # TODO: Replace with PostgreSQL + SQLAlchemy for persistence
    # TODO: Add Redis for caching frequently accessed conversations
    conversations: Dict[str, Conversation] = {}
    
    # WebSocket connection manager
    class ConnectionManager:
        def __init__(self):
            self.active_connections: Dict[str, List[WebSocket]] = {}
            self.user_count: Dict[str, int] = {}
        
        async def connect(self, websocket: WebSocket, conversation_id: str):
            await websocket.accept()
            if conversation_id not in self.active_connections:
                self.active_connections[conversation_id] = []
                self.user_count[conversation_id] = 0
            self.active_connections[conversation_id].append(websocket)
            self.user_count[conversation_id] += 1
            
        def disconnect(self, websocket: WebSocket, conversation_id: str):
            if conversation_id in self.active_connections:
                self.active_connections[conversation_id].remove(websocket)
                self.user_count[conversation_id] -= 1
                if not self.active_connections[conversation_id]:
                    del self.active_connections[conversation_id]
                    del self.user_count[conversation_id]
        
        async def broadcast(self, message: str, conversation_id: str, exclude: WebSocket = None):
            if conversation_id in self.active_connections:
                for connection in self.active_connections[conversation_id]:
                    if connection != exclude:
                        await connection.send_text(message)
        
        async def send_to_all(self, message: str, conversation_id: str):
            if conversation_id in self.active_connections:
                for connection in self.active_connections[conversation_id]:
                    await connection.send_text(message)
        
        def get_user_count(self, conversation_id: str) -> int:
            return self.user_count.get(conversation_id, 0)
    
    manager = ConnectionManager()
    
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
    async def add_message(conversation_id: str, message_data: Dict[str, Any]) -> Message:
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
        
        # Broadcast to WebSocket clients
        broadcast_msg = WSMessageBroadcast(message=message.model_dump())
        await manager.send_to_all(broadcast_msg.model_dump_json(), conversation_id)
        
        return message
    
    @app.patch("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def update_message(conversation_id: str, message_id: str, update_data: Dict[str, Any]) -> Message:
        """Update a message in a conversation."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Find and update message
        for message in conversations[conversation_id].messages:
            if message.id == message_id:
                message.content = update_data["content"]
                message.edited_at = datetime.now()
                
                # Broadcast edit to WebSocket clients
                broadcast_msg = WSMessageEditedBroadcast(message=message.model_dump())
                await manager.send_to_all(broadcast_msg.model_dump_json(), conversation_id)
                
                return message
        
        raise HTTPException(status_code=404, detail="Message not found")
    
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
    
    @app.websocket("/v1/conversations/{conversation_id}/ws")
    async def websocket_endpoint(websocket: WebSocket, conversation_id: str):
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
                        # Check for empty content specifically
                        if "string should have at least 1 character" in str(e).lower() or "content cannot be empty" in str(e).lower():
                            error_msg = WSErrorMessage(message="Content cannot be empty")
                        else:
                            error_msg = WSErrorMessage(message=f"Invalid message: {str(e)}")
                        await websocket.send_text(error_msg.model_dump_json())
                
                elif message_dict.get("type") == "typing":
                    try:
                        # Validate and broadcast typing indicator
                        typing_msg = WSTypingIndicator(**message_dict)
                        await manager.broadcast(typing_msg.model_dump_json(), conversation_id, exclude=websocket)
                    except Exception:
                        pass  # Ignore invalid typing indicators
                
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