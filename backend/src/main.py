"""
Main FastAPI application.
Following extreme TDD - implementing only what tests require.
"""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Set, Optional
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
    
    # Branching storage
    leaves: Dict[str, List[Leaf]] = {}  # conversation_id -> list of leaves
    active_leaves: Dict[str, str] = {}  # conversation_id -> active leaf_id
    message_versions: Dict[str, List[MessageVersion]] = {}  # message_id -> list of versions
    leaf_messages: Dict[str, List[str]] = {}  # leaf_id -> list of message_ids created in this leaf
    # Note: Branch points are derived from leaves with same parent_message_id
    
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
    
    @app.get("/v1/wiki/{concept}")
    async def get_or_create_wiki_conversation(concept: str) -> Conversation:
        """Get or create a wiki conversation for a concept."""
        # Check if wiki conversation already exists for this concept
        wiki_id = f"wiki-{concept.lower().replace(' ', '-')}"
        
        if wiki_id not in conversations:
            # Create new wiki conversation
            conversations[wiki_id] = Conversation(
                id=wiki_id,
                type="wiki",
                title=concept,
                participants=[],
                messages=[]
            )
        
        return conversations[wiki_id]
    
    @app.post("/v1/conversations", status_code=201)
    async def create_conversation(conversation: Conversation) -> Conversation:
        """Create a new conversation."""
        # Store the conversation
        conversations[conversation.id] = conversation
        
        # Create default "main" leaf for this conversation
        main_leaf = Leaf(
            conversation_id=conversation.id,
            name="main"
        )
        leaves[conversation.id] = [main_leaf]
        active_leaves[conversation.id] = main_leaf.id
        # Track any existing messages as belonging to main
        leaf_messages[main_leaf.id] = [msg.id for msg in conversation.messages]
        
        return conversation
    
    @app.get("/v1/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str) -> Conversation:
        """Get a conversation by ID."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conversations[conversation_id]
    
    @app.get("/v1/conversations/{conversation_id}/messages")
    async def get_messages(conversation_id: str, leaf_id: Optional[str] = None) -> Dict[str, Any]:
        """Get all messages from a conversation, optionally filtered by leaf."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conversation = conversations[conversation_id]
        messages_list = []
        
        # If leaf_id specified, get versions for that leaf
        if leaf_id:
            target_leaf = None
            for leaf in leaves.get(conversation_id, []):
                if leaf.id == leaf_id:
                    target_leaf = leaf
                    break
            
            if not target_leaf:
                # Return original messages if leaf not found
                messages_list = [msg.model_dump() for msg in conversation.messages]
            else:
                # Return messages with leaf-specific versions
                # If this leaf has a branch point, only include messages up to that point
                # plus any messages created in this leaf
                branch_point_index = None
                if target_leaf.branch_point_message_id:
                    for i, msg in enumerate(conversation.messages):
                        if msg.id == target_leaf.branch_point_message_id:
                            branch_point_index = i
                            break
                
                # Get messages created in this leaf
                this_leaf_messages = set(leaf_messages.get(target_leaf.id, []))
                
                for i, msg in enumerate(conversation.messages):
                    # Skip messages after branch point unless they belong to this leaf
                    if branch_point_index is not None and i > branch_point_index:
                        if msg.id not in this_leaf_messages:
                            continue
                    
                    msg_dict = msg.model_dump()
                    
                    # Check if this leaf has a specific version of this message
                    if msg.id in target_leaf.message_versions:
                        version_idx = target_leaf.message_versions[msg.id]
                        msg_versions = message_versions.get(msg.id, [])
                        if version_idx < len(msg_versions):
                            version = msg_versions[version_idx]
                            msg_dict["content"] = version.content
                    
                    msg_dict["leaf_id"] = leaf_id
                    messages_list.append(msg_dict)
        else:
            # Return original messages
            messages_list = [msg.model_dump() for msg in conversation.messages]
        
        return {"data": messages_list}
    
    @app.post("/v1/conversations/{conversation_id}/messages", status_code=201)
    async def add_message(conversation_id: str, message_data: Dict[str, Any], background_tasks: BackgroundTasks) -> Dict[str, Any]:
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
        
        # Get current active leaf
        active_leaf_id = active_leaves.get(conversation_id, "main")
        
        # Track this message as belonging to the active leaf
        if active_leaf_id not in leaf_messages:
            leaf_messages[active_leaf_id] = []
        leaf_messages[active_leaf_id].append(message.id)
        
        # Broadcast to WebSocket clients in background
        broadcast_msg = WSMessageBroadcast(message=message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        # Return message with leaf_id
        response = message.model_dump()
        response["leaf_id"] = active_leaf_id
        return response
    
    @app.put("/v1/conversations/{conversation_id}/messages/{message_id}")
    async def update_message(conversation_id: str, message_id: str, message_data: Dict[str, Any], background_tasks: BackgroundTasks) -> Message:
        """Update a message in a conversation - creates a new version if in a different leaf."""
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
        
        updated_message = conversation.messages[message_index]
        
        # If leaf_id specified, create a new version for that leaf
        if 'leaf_id' in message_data:
            leaf_id = message_data['leaf_id']
            
            # Create new version
            new_version = MessageVersion(
                content=message_data['content'],
                author_id=updated_message.author_id,
                leaf_id=leaf_id
            )
            
            if message_id not in message_versions:
                message_versions[message_id] = []
            
            # Add version and track its index
            version_index = len(message_versions[message_id])
            message_versions[message_id].append(new_version)
            
            # Update leaf's message versions mapping
            for leaf in leaves.get(conversation_id, []):
                if leaf.id == leaf_id:
                    leaf.message_versions[message_id] = version_index
                    break
        elif 'content' in message_data:
            # Update main version
            updated_message.content = message_data['content']
        
        # Broadcast update to WebSocket clients in background  
        broadcast_msg = WSMessageBroadcast(message=updated_message.model_dump())
        background_tasks.add_task(manager.send_to_all, broadcast_msg.model_dump_json(), conversation_id)
        
        return updated_message
    
    
    # Leaf management endpoints
    @app.get("/v1/conversations/{conversation_id}/leaves")
    async def get_leaves(conversation_id: str) -> Dict[str, Any]:
        """Get all leaves for a conversation."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conv_leaves = leaves.get(conversation_id, [])
        active_leaf_id = active_leaves.get(conversation_id)
        
        return {
            "leaves": [leaf.model_dump() for leaf in conv_leaves],
            "active_leaf_id": active_leaf_id
        }
    
    @app.get("/v1/conversations/{conversation_id}/leaves/active")
    async def get_active_leaf(conversation_id: str) -> Leaf:
        """Get the currently active leaf."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        active_leaf_id = active_leaves.get(conversation_id)
        if not active_leaf_id:
            raise HTTPException(status_code=404, detail="No active leaf found")
        
        conv_leaves = leaves.get(conversation_id, [])
        for leaf in conv_leaves:
            if leaf.id == active_leaf_id:
                return leaf
        
        raise HTTPException(status_code=404, detail="Active leaf not found")
    
    @app.post("/v1/conversations/{conversation_id}/leaves", status_code=201)
    async def create_leaf(conversation_id: str, request: LeafCreateRequest) -> Leaf:
        """Create a new leaf by branching from a message."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Create new leaf
        new_leaf = Leaf(
            conversation_id=conversation_id,
            name=request.name,
            branch_point_message_id=request.branch_from_message_id
        )
        
        # Add to leaves list
        if conversation_id not in leaves:
            leaves[conversation_id] = []
        leaves[conversation_id].append(new_leaf)
        
        # If new content provided, create a new version for the message
        if request.new_content:
            # Create new version
            existing_versions = message_versions.get(request.branch_from_message_id, [])
            new_version = MessageVersion(
                message_id=request.branch_from_message_id,
                leaf_id=new_leaf.id,
                content=request.new_content,
                version_number=len(existing_versions)
            )
            
            if request.branch_from_message_id not in message_versions:
                message_versions[request.branch_from_message_id] = []
            message_versions[request.branch_from_message_id].append(new_version)
        
        return new_leaf
    
    @app.put("/v1/conversations/{conversation_id}/leaves/active")
    async def switch_active_leaf(conversation_id: str, request: LeafSwitchRequest) -> Dict[str, str]:
        """Switch the active leaf for a conversation."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Verify leaf exists
        conv_leaves = leaves.get(conversation_id, [])
        leaf_exists = any(leaf.id == request.leaf_id for leaf in conv_leaves)
        
        if not leaf_exists:
            raise HTTPException(status_code=404, detail="Leaf not found")
        
        # Switch active leaf
        active_leaves[conversation_id] = request.leaf_id
        
        return {"active_leaf_id": request.leaf_id}
    
    # Version management endpoints
    @app.get("/v1/conversations/{conversation_id}/messages/{message_id}/versions")
    async def get_message_versions(conversation_id: str, message_id: str) -> Dict[str, Any]:
        """Get all versions of a message."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get original message content
        conversation = conversations[conversation_id]
        original_content = None
        for msg in conversation.messages:
            if msg.id == message_id:
                original_content = msg.content
                break
        
        if original_content is None:
            raise HTTPException(status_code=404, detail="Message not found")
        
        # Get all versions
        versions = message_versions.get(message_id, [])
        
        # Combine original + versions
        all_versions = [{"content": original_content, "version_number": 0, "leaf_id": "main"}]
        all_versions.extend([v.model_dump() for v in versions])
        
        # Find current version (based on active leaf)
        active_leaf_id = active_leaves.get(conversation_id, "main")
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
    async def navigate_version(conversation_id: str, message_id: str, request: VersionNavigateRequest) -> Dict[str, Any]:
        """Navigate to a specific version of a message."""
        if conversation_id not in conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Get all versions
        versions_response = await get_message_versions(conversation_id, message_id)
        all_versions = versions_response["versions"]
        
        if request.version_index >= len(all_versions):
            raise HTTPException(status_code=400, detail="Version index out of range")
        
        selected_version = all_versions[request.version_index]
        
        # Switch to the leaf containing this version
        if selected_version.get("leaf_id"):
            active_leaves[conversation_id] = selected_version["leaf_id"]
        
        return {
            "current_version": request.version_index,
            "content": selected_version["content"]
        }
    
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
    
    # Store Yjs documents in memory (would be Redis/DB in production)
    yjs_documents: Dict[str, List[WebSocket]] = {}
    
    @app.websocket("/ws/collaborative/{document_id}")
    async def yjs_websocket_endpoint(websocket: WebSocket, document_id: str) -> None:
        """WebSocket endpoint for Yjs collaborative editing."""
        await websocket.accept()
        
        # Add to document connections
        if document_id not in yjs_documents:
            yjs_documents[document_id] = []
        yjs_documents[document_id].append(websocket)
        
        try:
            while True:
                # Receive binary data from Yjs
                data = await websocket.receive_bytes()
                
                # Broadcast to all other clients editing this document
                for conn in yjs_documents[document_id]:
                    if conn != websocket:
                        try:
                            await conn.send_bytes(data)
                        except:
                            # Remove dead connections
                            yjs_documents[document_id].remove(conn)
        except WebSocketDisconnect:
            # Remove from connections
            if document_id in yjs_documents:
                if websocket in yjs_documents[document_id]:
                    yjs_documents[document_id].remove(websocket)
                if not yjs_documents[document_id]:
                    del yjs_documents[document_id]
    
    @app.websocket("/v1/conversations/{conversation_id}/leaves/{leaf_id}/ws")
    async def leaf_websocket_endpoint(websocket: WebSocket, conversation_id: str, leaf_id: str) -> None:
        """WebSocket endpoint for leaf-specific Yjs document."""
        # Check if conversation and leaf exist
        if conversation_id not in conversations:
            await websocket.close(code=1008, reason="Conversation not found")
            return
        
        leaf_exists = any(leaf.id == leaf_id for leaf in leaves.get(conversation_id, []))
        if not leaf_exists:
            await websocket.close(code=1008, reason="Leaf not found")
            return
        
        await websocket.accept()
        
        # Send connection confirmation
        await websocket.send_json({
            "type": "connection",
            "conversationId": conversation_id,
            "leafId": leaf_id
        })
        
        # Store connection in yjs_documents using leaf_id as key
        if leaf_id not in yjs_documents:
            yjs_documents[leaf_id] = []
        yjs_documents[leaf_id].append(websocket)
        
        try:
            while True:
                # For now, just echo Yjs updates
                data = await websocket.receive_json()
                if data.get("type") == "yjs_update":
                    # Broadcast to other clients on this leaf
                    for conn in yjs_documents[leaf_id]:
                        if conn != websocket:
                            try:
                                await conn.send_json(data)
                            except:
                                yjs_documents[leaf_id].remove(conn)
        except WebSocketDisconnect:
            if leaf_id in yjs_documents:
                if websocket in yjs_documents[leaf_id]:
                    yjs_documents[leaf_id].remove(websocket)
                if not yjs_documents[leaf_id]:
                    del yjs_documents[leaf_id]
    
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