"""
Main FastAPI application.
Following extreme TDD - implementing only what tests require.
"""
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any
import uuid
from datetime import datetime

from .models import (
    Conversation,
    Message,
    ChatCompletionRequest,
    ChatCompletionResponse,
    Choice,
    ChatMessage,
    Participant
)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="LLM UX API",
        version="0.1.0",
        description="Collaborative chat & knowledge system API"
    )
    
    # In-memory storage for tests (will be replaced with database)
    conversations: Dict[str, Conversation] = {}
    
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
        
        return message
    
    @app.post("/v1/chat/completions")
    async def create_chat_completion(request: ChatCompletionRequest) -> ChatCompletionResponse:
        """OpenAI-compatible chat completion endpoint."""
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
    
    return app


# For running directly with uvicorn
app = create_app()