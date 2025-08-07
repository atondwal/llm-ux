"""
Main FastAPI application.
Following extreme TDD - implementing only what tests require.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Set, Optional
import uuid
from datetime import datetime
import json
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Conversation,
    Message,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Choice,
    ChatMessage,
    Participant
)
from .branching_models import (
    Leaf,
    MessageVersion,
    LeafCreateRequest,
    LeafSwitchRequest,
    VersionNavigateRequest,
    MessageUpdateRequest
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
from .database import get_db, init_db, async_session
from .repository import ConversationRepository, LeafRepository


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="LLM UX API",
        version="0.1.0",
        description="Collaborative chat & knowledge system API"
    )
    
    @app.on_event("startup")
    async def startup_event():
        """Initialize database on startup."""
        await init_db()
    
    # Add CORS middleware for frontend
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8081", "http://localhost:8082", "http://localhost:3000", "*"],  # Allow all for dev
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Keep WebSocket connection state in memory (not persisted)
    # Database handles all persistent data
    
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
    async def list_conversations(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
        """List all conversations."""
        repo = ConversationRepository(db)
        conversations = await repo.list_all()
        return {"data": [conv.model_dump() for conv in conversations]}
    
    @app.get("/v1/wiki/{concept}")
    async def get_or_create_wiki_conversation(concept: str, db: AsyncSession = Depends(get_db)) -> Conversation:
        """Get or create a wiki conversation for a concept."""
        wiki_id = f"wiki-{concept.lower().replace(' ', '-')}"
        
        repo = ConversationRepository(db)
        conversation = await repo.get(wiki_id)
        
        if not conversation:
            # Create new wiki conversation
            conversation = Conversation(
                id=wiki_id,
                type="wiki",
                title=concept,
                participants=[],
                messages=[]
            )
            conversation = await repo.create(conversation)
        
        return conversation
    
    @app.post("/v1/conversations", status_code=201)
    async def create_conversation(conversation: Conversation, db: AsyncSession = Depends(get_db)) -> Conversation:
        """Create a new conversation."""
        repo = ConversationRepository(db)
        return await repo.create(conversation)
    
    @app.get("/v1/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)) -> Conversation:
        """Get a conversation by ID."""
        repo = ConversationRepository(db)
        conversation = await repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation
    
    @app.patch("/v1/conversations/{conversation_id}")
    async def update_conversation(
        conversation_id: str, 
        update_data: Dict[str, Any],
        db: AsyncSession = Depends(get_db)
    ) -> Conversation:
        """Update conversation details (e.g., title)."""
        repo = ConversationRepository(db)
        conversation = await repo.update(conversation_id, update_data)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversation
    
    @app.delete("/v1/conversations/{conversation_id}")
    async def delete_conversation(
        conversation_id: str,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, str]:
        """Delete a conversation and all its messages."""
        repo = ConversationRepository(db)
        success = await repo.delete(conversation_id)
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"message": "Conversation deleted successfully"}
    
    @app.get("/v1/conversations/{conversation_id}/messages")
    async def get_messages(conversation_id: str, leaf_id: Optional[str] = None, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
        """Get all messages from a conversation, optionally filtered by leaf."""
        repo = ConversationRepository(db)
        
        # Check conversation exists
        conversation = await repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        messages = await repo.get_messages(conversation_id, leaf_id)
        return {"data": messages}
    
    @app.post("/v1/conversations/{conversation_id}/messages", status_code=201)
    async def add_message(
        conversation_id: str, 
        message_data: Dict[str, Any], 
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """Add a message to a conversation."""
        repo = ConversationRepository(db)
        
        # Check conversation exists
        conversation = await repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Create message
        message = Message(
            conversation_id=conversation_id,
            **message_data
        )
        
        # Get active leaf
        leaf_repo = LeafRepository(db)
        active_leaf = await leaf_repo.get_active(conversation_id)
        
        # Add message to database
        await repo.add_message(conversation_id, message, active_leaf.id if active_leaf else None)
        
        # Broadcast to WebSocket clients in background
        broadcast_msg = WSMessageBroadcast(message=message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        # Return message with leaf_id
        response = message.model_dump()
        response["leaf_id"] = active_leaf.id if active_leaf else "main"
        return response
    
    @app.delete("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def delete_message(
        conversation_id: str,
        message_id: str,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, str]:
        """Delete a message and all its versions."""
        repo = ConversationRepository(db)
        
        # Check conversation exists
        conversation = await repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Delete the message
        success = await repo.delete_message(conversation_id, message_id)
        if not success:
            raise HTTPException(status_code=404, detail="Message not found")
        
        return {"message": "Message deleted successfully"}
    
    @app.put("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def update_message(
        conversation_id: str, 
        message_id: str, 
        message_data: Dict[str, Any], 
        background_tasks: BackgroundTasks,
        db: AsyncSession = Depends(get_db)
    ) -> Message:
        """Update a message in a conversation - creates a new version if in a different leaf."""
        repo = ConversationRepository(db)
        
        # Check conversation exists
        conversation = await repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check message exists
        message_found = False
        for msg in conversation.messages:
            if msg.id == message_id:
                message_found = True
                break
        
        if not message_found:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Update message
        leaf_id = message_data.get('leaf_id')
        content = message_data.get('content', '')
        
        updated_message = await repo.update_message(conversation_id, message_id, content, leaf_id)
        
        if not updated_message:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Broadcast update to WebSocket clients in background  
        broadcast_msg = WSMessageBroadcast(message=updated_message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        return updated_message
    
    
    # Leaf management endpoints
    @app.get("/v1/conversations/{conversation_id}/leaves")
    async def get_leaves(conversation_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
        """Get all leaves for a conversation."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        leaf_repo = LeafRepository(db)
        conv_leaves = await leaf_repo.get_all(conversation_id)
        active_leaf = await leaf_repo.get_active(conversation_id)
        
        return {
            "leaves": [leaf.model_dump() for leaf in conv_leaves],
            "active_leaf_id": active_leaf.id if active_leaf else None
        }
    
    @app.get("/v1/conversations/{conversation_id}/leaves/active")
    async def get_active_leaf(conversation_id: str, db: AsyncSession = Depends(get_db)) -> Leaf:
        """Get the currently active leaf."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        leaf_repo = LeafRepository(db)
        active_leaf = await leaf_repo.get_active(conversation_id)
        
        if not active_leaf:
            raise HTTPException(status_code=404, detail="No active leaf found")
        
        return active_leaf
    
    @app.post("/v1/conversations/{conversation_id}/leaves", status_code=201)
    async def create_leaf(
        conversation_id: str, 
        request: LeafCreateRequest,
        db: AsyncSession = Depends(get_db)
    ) -> Leaf:
        """Create a new leaf by branching from a message."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        leaf_repo = LeafRepository(db)
        new_leaf = await leaf_repo.create(
            conversation_id=conversation_id,
            name=request.name,
            branch_from_message_id=request.branch_from_message_id,
            new_content=request.new_content
        )
        
        return new_leaf
    
    @app.delete("/v1/conversations/{conversation_id}/leaves/{leaf_id}")
    async def delete_leaf(
        conversation_id: str,
        leaf_id: str,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, str]:
        """Delete a leaf/branch and all its associated data."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        leaf_repo = LeafRepository(db)
        
        # Don't allow deleting the main leaf
        all_leaves = await leaf_repo.get_all(conversation_id)
        target_leaf = next((l for l in all_leaves if l.id == leaf_id), None)
        
        if not target_leaf:
            raise HTTPException(status_code=404, detail="Leaf not found")
        
        if target_leaf.name == "main":
            raise HTTPException(status_code=400, detail="Cannot delete main branch")
        
        # If this is the active leaf, switch to main first
        active_leaf = await leaf_repo.get_active(conversation_id)
        if active_leaf and active_leaf.id == leaf_id:
            main_leaf = next((l for l in all_leaves if l.name == "main"), None)
            if main_leaf:
                await leaf_repo.set_active(conversation_id, main_leaf.id)
        
        # Delete the leaf
        success = await leaf_repo.delete(leaf_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete leaf")
        
        return {"message": "Branch deleted successfully"}
    
    @app.post("/v1/conversations/{conversation_id}/messages/prune")
    async def prune_messages_after(
        conversation_id: str,
        request: Dict[str, str],
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """Delete all messages after a given message in the current leaf."""
        message_id = request.get("after_message_id")
        leaf_id = request.get("leaf_id")
        
        if not message_id:
            raise HTTPException(status_code=400, detail="after_message_id is required")
        
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get messages for the leaf
        messages = await conv_repo.get_messages(conversation_id, leaf_id)
        
        # Find the index of the message to prune after
        prune_index = -1
        for i, msg in enumerate(messages):
            if msg["id"] == message_id:
                prune_index = i
                break
        
        if prune_index == -1:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Delete all messages after this one
        deleted_count = 0
        for msg in messages[prune_index + 1:]:
            if await conv_repo.delete_message(conversation_id, msg["id"]):
                deleted_count += 1
        
        return {
            "message": f"Pruned {deleted_count} messages",
            "deleted_count": deleted_count
        }
    
    @app.put("/v1/conversations/{conversation_id}/leaves/active")
    async def switch_active_leaf(
        conversation_id: str, 
        request: LeafSwitchRequest,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, str]:
        """Switch the active leaf for a conversation."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        leaf_repo = LeafRepository(db)
        success = await leaf_repo.set_active(conversation_id, request.leaf_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="Leaf not found")
        
        return {"active_leaf_id": request.leaf_id}
    
    # Version management endpoints
    @app.get("/v1/conversations/{conversation_id}/messages/{message_id}/versions")
    async def get_message_versions(
        conversation_id: str, 
        message_id: str,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """Get all versions of a message."""
        # Check conversation exists
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Check message exists
        message_found = False
        for msg in conversation.messages:
            if msg.id == message_id:
                message_found = True
                break
        
        if not message_found:
            raise HTTPException(status_code=404, detail="Message not found")
        
        leaf_repo = LeafRepository(db)
        all_versions = await leaf_repo.get_message_versions(message_id)
        
        # Find current version (based on active leaf)
        active_leaf = await leaf_repo.get_active(conversation_id)
        active_leaf_id = active_leaf.id if active_leaf else "main"
        
        current_version = 0
        for i, v in enumerate(all_versions):
            if v.get("leaf_id") == active_leaf_id:
                current_version = i
                break
        
        return {
            "versions": all_versions,
            "current_version": current_version
        }
    
    @app.put("/v1/conversations/{conversation_id}/messages/{message_id}/version")
    async def navigate_version(
        conversation_id: str, 
        message_id: str, 
        request: VersionNavigateRequest,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, Any]:
        """Navigate to a specific version of a message."""
        # Get all versions
        versions_response = await get_message_versions(conversation_id, message_id, db)
        all_versions = versions_response["versions"]
        
        if request.version_index >= len(all_versions):
            raise HTTPException(status_code=400, detail="Version index out of range")
        
        selected_version = all_versions[request.version_index]
        
        # Switch to the leaf containing this version
        if selected_version.get("leaf_id"):
            leaf_repo = LeafRepository(db)
            await leaf_repo.set_active(conversation_id, selected_version["leaf_id"])
        
        return {
            "current_version": request.version_index,
            "content": selected_version["content"]
        }
    
    @app.get("/v1/conversations/{conversation_id}/messages/{message_id}/editors")
    async def get_active_editors(
        conversation_id: str, 
        message_id: str,
        db: AsyncSession = Depends(get_db)
    ) -> Dict[str, List[str]]:
        """Get list of users currently editing a message."""
        # Check conversation and message exist
        conv_repo = ConversationRepository(db)
        conversation = await conv_repo.get(conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        message_exists = any(msg.id == message_id for msg in conversation.messages)
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
    
    @app.websocket("/v1/conversations/{conversation_id}/ws")
    async def websocket_endpoint(websocket: WebSocket, conversation_id: str) -> None:
        """WebSocket endpoint for real-time conversation updates."""
        # Check if conversation exists in database
        async with async_session() as db:
            conv_repo = ConversationRepository(db)
            conversation = await conv_repo.get(conversation_id)
            if not conversation:
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
                        
                        # Create and store message in database
                        async with async_session() as db:
                            conv_repo = ConversationRepository(db)
                            conversation = await conv_repo.get(conversation_id)
                            
                            if not conversation:
                                error_msg = WSErrorMessage(message="Conversation not found")
                                await websocket.send_text(error_msg.model_dump_json())
                                continue
                            
                            # Check if author exists in conversation
                            author_exists = any(
                                p.id == ws_msg.authorId 
                                for p in conversation.participants
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
                            
                            # Add to database
                            leaf_repo = LeafRepository(db)
                            active_leaf = await leaf_repo.get_active(conversation_id)
                            await conv_repo.add_message(
                                conversation_id, 
                                message, 
                                active_leaf.id if active_leaf else None
                            )
                        
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
    
    # Yjs collaborative editing rooms
    @app.websocket("/ws/collaborative/{room_name}")
    async def yjs_websocket_endpoint(websocket: WebSocket, room_name: str) -> None:
        """Simple Yjs WebSocket relay for collaborative editing."""
        await websocket.accept()
        
        # For now, just echo messages back to support Yjs sync
        # In production, you'd want to implement proper Yjs awareness protocol
        try:
            while True:
                data = await websocket.receive_bytes()
                # Echo back to the same client for now
                # In a real implementation, broadcast to all clients in the room
                await websocket.send_bytes(data)
        except WebSocketDisconnect:
            pass
    
    return app


# For running directly with uvicorn
app = create_app()
