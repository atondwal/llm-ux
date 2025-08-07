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


class WSEditingStart(BaseModel):
    """Start editing a message."""
    type: Literal["start_editing"] = "start_editing"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    
    class Config:
        populate_by_name = True


class WSEditingStarted(BaseModel):
    """Editing session started."""
    type: Literal["editing_started"] = "editing_started"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    
    class Config:
        populate_by_name = True


class WSEditingStop(BaseModel):
    """Stop editing a message."""
    type: Literal["stop_editing"] = "stop_editing"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    
    class Config:
        populate_by_name = True


class WSEditingStopped(BaseModel):
    """Editing session stopped."""
    type: Literal["editing_stopped"] = "editing_stopped"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    
    class Config:
        populate_by_name = True


class WSTextDelta(BaseModel):
    """Real-time text change for collaborative editing."""
    type: Literal["text_delta"] = "text_delta"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    text: str  # The current full text content
    cursorPosition: int = Field(..., alias="cursorPosition")  # Cursor position after edit
    
    class Config:
        populate_by_name = True


class WSCursorMove(BaseModel):
    """Cursor position update for showing where others are editing."""
    type: Literal["cursor_move"] = "cursor_move"
    messageId: str = Field(..., alias="messageId")
    userId: str = Field(..., alias="userId")
    cursorPosition: int = Field(..., alias="cursorPosition")
    
    class Config:
        populate_by_name = True