"""
Models for branching conversation functionality.
Following the design: One Yjs document per leaf.
Simplified: No separate Branch entity, just versions per message.
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid


class MessageVersion(BaseModel):
    """A version of a message content in a specific leaf."""
    content: str
    author_id: str
    leaf_id: str
    created_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Leaf(BaseModel):
    """A conversation path/timeline with its own Yjs document."""
    id: str = Field(default_factory=lambda: f"leaf-{uuid.uuid4().hex[:8]}")
    conversation_id: str
    name: str = "main"
    parent_leaf_id: Optional[str] = None  # Which leaf this branched from
    branch_point_message_id: Optional[str] = None  # Where the branch occurred
    created_at: datetime = Field(default_factory=datetime.now)
    last_active: datetime = Field(default_factory=datetime.now)
    yjs_doc_id: str = Field(default_factory=lambda: f"yjs-{uuid.uuid4().hex[:8]}")
    # Track which version of each message this leaf uses
    message_versions: Dict[str, int] = Field(default_factory=dict)  # message_id -> version_index
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class LeafCreateRequest(BaseModel):
    """Request to create a new leaf."""
    branch_from_message_id: str
    name: str
    new_content: Optional[str] = None  # Optional new content for the branched message


class LeafSwitchRequest(BaseModel):
    """Request to switch active leaf."""
    leaf_id: str


class VersionNavigateRequest(BaseModel):
    """Request to navigate to a specific version."""
    version_index: int


class MessageUpdateRequest(BaseModel):
    """Request to update a message in a specific leaf."""
    content: str
    leaf_id: Optional[str] = None  # If None, uses active leaf