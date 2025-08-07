"""
WebSocket message type definitions.
Following Type-First development approach.
"""
from pydantic import BaseModel, Field, validator
from typing import Literal, Optional, Dict, Any
from datetime import datetime


class WSConnectionMessage(BaseModel):
    """WebSocket connection established message."""
    type: Literal["connection"] = "connection"
    status: Literal["connected"] = "connected"
    conversationId: str = Field(..., alias="conversationId")
    
    class Config:
        populate_by_name = True


class WSMessageData(BaseModel):
    """Data for a new message via WebSocket."""
    type: Literal["message"] = "message"
    authorId: str = Field(..., alias="authorId")
    content: str = Field(..., min_length=1)
    
    class Config:
        populate_by_name = True


class WSMessageBroadcast(BaseModel):
    """Broadcast message to all connected clients."""
    type: Literal["message"] = "message"
    message: Dict[str, Any]



class WSTypingIndicator(BaseModel):
    """Typing indicator message."""
    type: Literal["typing"] = "typing"
    authorId: str = Field(..., alias="authorId")
    isTyping: bool = Field(..., alias="isTyping")
    
    class Config:
        populate_by_name = True


class WSPresenceUpdate(BaseModel):
    """User presence update message."""
    type: Literal["presence"] = "presence"
    action: Literal["joined", "left"]
    activeUsers: int = Field(..., alias="activeUsers")
    
    class Config:
        populate_by_name = True


class WSErrorMessage(BaseModel):
    """Error message for WebSocket."""
    type: Literal["error"] = "error"
    message: str