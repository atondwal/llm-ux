"""
Pydantic models for type safety and validation.
Following extreme TDD - implementing only what tests require.
"""
from datetime import datetime
from typing import Literal, Optional, Dict, Any, List
from pydantic import BaseModel, Field, field_validator
import uuid


class Participant(BaseModel):
    """A conversation participant - can be human or AI."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["human", "ai"]
    name: str
    
    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v


class Message(BaseModel):
    """A message in a conversation."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    author_id: str
    content: str
    created_at: datetime = Field(default_factory=datetime.now)
    edited_at: Optional[datetime] = None
    
    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Content cannot be empty")
        return v


class Conversation(BaseModel):
    """The core conversation model - everything is a conversation."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["chat", "wiki_tag"]
    title: str
    participants: List[Participant] = Field(default_factory=list)
    messages: List[Message] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None
    
    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        return v


# OpenAI-compatible models
class ChatMessage(BaseModel):
    """OpenAI-compatible chat message."""
    role: Literal["system", "user", "assistant"]
    content: str


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""
    messages: List[ChatMessage]
    model: str
    conversation_id: Optional[str] = None  # Our extension
    stream: bool = False
    temperature: float = 1.0
    max_tokens: Optional[int] = None


class Choice(BaseModel):
    """OpenAI-compatible response choice."""
    index: int
    message: ChatMessage
    finish_reason: Literal["stop", "length", "content_filter", "function_call"]


class ChatCompletionResponse(BaseModel):
    """OpenAI-compatible chat completion response."""
    id: str
    object: Literal["chat.completion"]
    created: int
    model: str
    choices: List[Choice]
    usage: Optional[Dict[str, int]] = None