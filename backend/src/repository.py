"""
Database repository layer for handling database operations.
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
import uuid
from datetime import datetime

from .database import (
    ConversationDB, MessageDB, ParticipantDB, LeafDB, MessageVersionDB
)
from .models import Conversation, Message, Participant
from .branching_models import Leaf, MessageVersion


class ConversationRepository:
    """Repository for conversation operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, conversation: Conversation) -> Conversation:
        """Create a new conversation with default main leaf."""
        # Create conversation
        db_conv = ConversationDB(
            id=conversation.id,
            type=conversation.type,
            title=conversation.title
        )
        self.session.add(db_conv)
        
        # Create participants
        for participant in conversation.participants:
            db_participant = ParticipantDB(
                participant_id=participant.id,
                conversation_id=conversation.id,
                type=participant.type,
                name=participant.name
            )
            self.session.add(db_participant)
        
        # Create default main leaf
        main_leaf = LeafDB(
            id=f"leaf-{uuid.uuid4().hex[:8]}",
            conversation_id=conversation.id,
            name="main",
            is_active="true"
        )
        self.session.add(main_leaf)
        
        # Add any initial messages
        for message in conversation.messages:
            db_message = MessageDB(
                id=message.id,
                conversation_id=conversation.id,
                author_id=message.author_id,
                content=message.content,
                created_in_leaf_id=main_leaf.id
            )
            self.session.add(db_message)
        
        await self.session.commit()
        return conversation
    
    async def get(self, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID."""
        result = await self.session.execute(
            select(ConversationDB)
            .options(
                selectinload(ConversationDB.messages),
                selectinload(ConversationDB.participants)
            )
            .where(ConversationDB.id == conversation_id)
        )
        db_conv = result.scalar_one_or_none()
        
        if not db_conv:
            return None
        
        # Convert to Pydantic model
        participants = [
            Participant(
                id=p.participant_id,
                type=p.type,
                name=p.name
            )
            for p in db_conv.participants
        ]
        
        messages = [
            Message(
                id=m.id,
                conversation_id=m.conversation_id,
                author_id=m.author_id,
                content=m.content,
                created_at=m.created_at.isoformat() if m.created_at else None
            )
            for m in db_conv.messages
        ]
        
        return Conversation(
            id=db_conv.id,
            type=db_conv.type,
            title=db_conv.title,
            participants=participants,
            messages=messages,
            created_at=db_conv.created_at.isoformat() if db_conv.created_at else None
        )
    
    async def update(self, conversation_id: str, update_data: Dict[str, Any]) -> Optional[Conversation]:
        """Update a conversation's details."""
        result = await self.session.execute(
            select(ConversationDB).where(ConversationDB.id == conversation_id)
        )
        db_conv = result.scalar_one_or_none()
        
        if not db_conv:
            return None
        
        # Update allowed fields
        if 'title' in update_data:
            db_conv.title = update_data['title']
        if 'type' in update_data:
            db_conv.type = update_data['type']
        
        await self.session.commit()
        
        # Return updated conversation
        return await self.get(conversation_id)
    
    async def delete(self, conversation_id: str) -> bool:
        """Delete a conversation and all related data."""
        result = await self.session.execute(
            select(ConversationDB).where(ConversationDB.id == conversation_id)
        )
        db_conv = result.scalar_one_or_none()
        
        if not db_conv:
            return False
        
        # Delete conversation (cascades to messages, participants, leaves, etc.)
        await self.session.delete(db_conv)
        await self.session.commit()
        return True
    
    async def list_all(self) -> List[Conversation]:
        """List all conversations."""
        result = await self.session.execute(
            select(ConversationDB)
            .options(
                selectinload(ConversationDB.participants)
            )
        )
        db_convs = result.scalars().all()
        
        conversations = []
        for db_conv in db_convs:
            participants = [
                Participant(
                    id=p.participant_id,
                    type=p.type,
                    name=p.name
                )
                for p in db_conv.participants
            ]
            
            conversations.append(Conversation(
                id=db_conv.id,
                type=db_conv.type,
                title=db_conv.title,
                participants=participants,
                messages=[],  # Don't load all messages for list
                created_at=db_conv.created_at.isoformat() if db_conv.created_at else None
            ))
        
        return conversations
    
    async def add_message(self, conversation_id: str, message: Message, leaf_id: Optional[str] = None) -> Message:
        """Add a message to a conversation."""
        # Get active leaf if not specified
        if not leaf_id:
            result = await self.session.execute(
                select(LeafDB)
                .where(and_(
                    LeafDB.conversation_id == conversation_id,
                    LeafDB.is_active == "true"
                ))
            )
            active_leaf = result.scalar_one_or_none()
            leaf_id = active_leaf.id if active_leaf else None
        
        db_message = MessageDB(
            id=message.id,
            conversation_id=conversation_id,
            author_id=message.author_id,
            content=message.content,
            created_in_leaf_id=leaf_id
        )
        self.session.add(db_message)
        await self.session.commit()
        
        return message
    
    async def delete_message(self, conversation_id: str, message_id: str) -> bool:
        """Delete a message and all its versions."""
        result = await self.session.execute(
            select(MessageDB).where(MessageDB.id == message_id)
        )
        db_message = result.scalar_one_or_none()
        
        if not db_message:
            return False
        
        # Delete the message (cascades to versions)
        await self.session.delete(db_message)
        await self.session.commit()
        return True
    
    async def update_message(self, conversation_id: str, message_id: str, content: str, leaf_id: Optional[str] = None) -> Optional[Message]:
        """Update a message or create a version."""
        result = await self.session.execute(
            select(MessageDB).where(MessageDB.id == message_id)
        )
        db_message = result.scalar_one_or_none()
        
        if not db_message:
            return None
        
        if leaf_id:
            # Create a new version for this leaf
            # Get current version count
            version_result = await self.session.execute(
                select(MessageVersionDB)
                .where(MessageVersionDB.message_id == message_id)
            )
            versions = version_result.scalars().all()
            version_number = len(versions)
            
            # Create new version
            db_version = MessageVersionDB(
                message_id=message_id,
                content=content,
                author_id=db_message.author_id,
                leaf_id=leaf_id,
                version_number=version_number
            )
            self.session.add(db_version)
            
            # Update leaf's message versions mapping
            leaf_result = await self.session.execute(
                select(LeafDB).where(LeafDB.id == leaf_id)
            )
            db_leaf = leaf_result.scalar_one_or_none()
            if db_leaf:
                if not db_leaf.message_versions:
                    db_leaf.message_versions = {}
                db_leaf.message_versions[message_id] = version_number
        else:
            # Update main version
            db_message.content = content
        
        await self.session.commit()
        
        return Message(
            id=db_message.id,
            conversation_id=db_message.conversation_id,
            author_id=db_message.author_id,
            content=db_message.content if not leaf_id else content
        )
    
    async def get_messages(self, conversation_id: str, leaf_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get messages for a conversation, optionally filtered by leaf."""
        # Get all messages for the conversation
        result = await self.session.execute(
            select(MessageDB)
            .where(MessageDB.conversation_id == conversation_id)
            .order_by(MessageDB.created_at)
        )
        db_messages = result.scalars().all()
        
        messages = []
        
        if leaf_id:
            # Get the leaf and its branch point
            leaf_result = await self.session.execute(
                select(LeafDB).where(LeafDB.id == leaf_id)
            )
            db_leaf = leaf_result.scalar_one_or_none()
            
            if db_leaf:
                # Find branch point index
                branch_point_index = None
                if db_leaf.branch_point_message_id:
                    for i, msg in enumerate(db_messages):
                        if msg.id == db_leaf.branch_point_message_id:
                            branch_point_index = i
                            break
                
                # Filter messages based on leaf
                for i, db_msg in enumerate(db_messages):
                    # Include messages up to and including branch point
                    if branch_point_index is not None and i > branch_point_index:
                        # After branch point, only include messages created in this leaf
                        if db_msg.created_in_leaf_id != leaf_id:
                            continue
                    elif branch_point_index is None:
                        # No branch point - check if message belongs to other leaves
                        if db_msg.created_in_leaf_id and db_msg.created_in_leaf_id != leaf_id:
                            continue
                    
                    msg_dict = {
                        "id": db_msg.id,
                        "conversation_id": db_msg.conversation_id,
                        "author_id": db_msg.author_id,
                        "content": db_msg.content,
                        "created_at": db_msg.created_at.isoformat() if db_msg.created_at else None,
                        "leaf_id": leaf_id
                    }
                    
                    # Check for leaf-specific version
                    if db_leaf.message_versions and db_msg.id in db_leaf.message_versions:
                        version_idx = db_leaf.message_versions[db_msg.id]
                        # Get the version
                        version_result = await self.session.execute(
                            select(MessageVersionDB)
                            .where(and_(
                                MessageVersionDB.message_id == db_msg.id,
                                MessageVersionDB.version_number == version_idx
                            ))
                        )
                        db_version = version_result.scalar_one_or_none()
                        if db_version:
                            msg_dict["content"] = db_version.content
                    
                    messages.append(msg_dict)
        else:
            # Return all messages
            messages = [
                {
                    "id": m.id,
                    "conversation_id": m.conversation_id,
                    "author_id": m.author_id,
                    "content": m.content,
                    "created_at": m.created_at.isoformat() if m.created_at else None
                }
                for m in db_messages
            ]
        
        return messages


class LeafRepository:
    """Repository for leaf operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, conversation_id: str, name: str, branch_from_message_id: Optional[str] = None, new_content: Optional[str] = None) -> Leaf:
        """Create a new leaf."""
        leaf_id = f"leaf-{uuid.uuid4().hex[:8]}"
        
        db_leaf = LeafDB(
            id=leaf_id,
            conversation_id=conversation_id,
            name=name,
            branch_point_message_id=branch_from_message_id,
            message_versions={}
        )
        self.session.add(db_leaf)
        
        # If new content provided, create a version
        if branch_from_message_id and new_content:
            # Get the original message to get author_id
            msg_result = await self.session.execute(
                select(MessageDB).where(MessageDB.id == branch_from_message_id)
            )
            db_message = msg_result.scalar_one_or_none()
            
            if db_message:
                # Get current version count
                version_result = await self.session.execute(
                    select(MessageVersionDB)
                    .where(MessageVersionDB.message_id == branch_from_message_id)
                )
                versions = version_result.scalars().all()
                version_number = len(versions)
                
                # Create new version
                db_version = MessageVersionDB(
                    message_id=branch_from_message_id,
                    content=new_content,
                    author_id=db_message.author_id,
                    leaf_id=leaf_id,
                    version_number=version_number
                )
                self.session.add(db_version)
                
                # Update leaf's message versions
                db_leaf.message_versions = {branch_from_message_id: version_number}
        
        await self.session.commit()
        
        return Leaf(
            id=leaf_id,
            conversation_id=conversation_id,
            name=name,
            branch_point_message_id=branch_from_message_id,
            message_versions=db_leaf.message_versions or {}
        )
    
    async def get_all(self, conversation_id: str) -> List[Leaf]:
        """Get all leaves for a conversation."""
        result = await self.session.execute(
            select(LeafDB)
            .where(LeafDB.conversation_id == conversation_id)
            .order_by(LeafDB.created_at)
        )
        db_leaves = result.scalars().all()
        
        return [
            Leaf(
                id=leaf.id,
                conversation_id=leaf.conversation_id,
                name=leaf.name,
                branch_point_message_id=leaf.branch_point_message_id,
                message_versions=leaf.message_versions or {}
            )
            for leaf in db_leaves
        ]
    
    async def get_active(self, conversation_id: str) -> Optional[Leaf]:
        """Get the active leaf for a conversation."""
        result = await self.session.execute(
            select(LeafDB)
            .where(and_(
                LeafDB.conversation_id == conversation_id,
                LeafDB.is_active == "true"
            ))
        )
        db_leaf = result.scalar_one_or_none()
        
        if not db_leaf:
            return None
        
        return Leaf(
            id=db_leaf.id,
            conversation_id=db_leaf.conversation_id,
            name=db_leaf.name,
            branch_point_message_id=db_leaf.branch_point_message_id,
            message_versions=db_leaf.message_versions or {}
        )
    
    async def delete(self, leaf_id: str) -> bool:
        """Delete a leaf and all its associated versions."""
        result = await self.session.execute(
            select(LeafDB).where(LeafDB.id == leaf_id)
        )
        db_leaf = result.scalar_one_or_none()
        
        if not db_leaf:
            return False
        
        # Delete all message versions associated with this leaf
        await self.session.execute(
            select(MessageVersionDB).where(MessageVersionDB.leaf_id == leaf_id)
        )
        
        # Delete the leaf
        await self.session.delete(db_leaf)
        await self.session.commit()
        return True
    
    async def set_active(self, conversation_id: str, leaf_id: str) -> bool:
        """Set the active leaf for a conversation."""
        # Deactivate all leaves
        result = await self.session.execute(
            select(LeafDB).where(LeafDB.conversation_id == conversation_id)
        )
        all_leaves = result.scalars().all()
        
        found = False
        for leaf in all_leaves:
            if leaf.id == leaf_id:
                leaf.is_active = "true"
                found = True
            else:
                leaf.is_active = "false"
        
        if found:
            await self.session.commit()
        
        return found
    
    async def get_message_versions(self, message_id: str) -> List[Dict[str, Any]]:
        """Get all versions of a message."""
        # Get original message
        msg_result = await self.session.execute(
            select(MessageDB).where(MessageDB.id == message_id)
        )
        db_message = msg_result.scalar_one_or_none()
        
        if not db_message:
            return []
        
        # Get all versions
        version_result = await self.session.execute(
            select(MessageVersionDB)
            .where(MessageVersionDB.message_id == message_id)
            .order_by(MessageVersionDB.version_number)
        )
        db_versions = version_result.scalars().all()
        
        # Combine original + versions
        all_versions = [
            {
                "content": db_message.content,
                "version_number": 0,
                "leaf_id": "main"
            }
        ]
        
        all_versions.extend([
            {
                "content": v.content,
                "version_number": v.version_number + 1,  # Offset by 1 since original is 0
                "leaf_id": v.leaf_id,
                "author_id": v.author_id,
                "created_at": v.created_at.isoformat() if v.created_at else None
            }
            for v in db_versions
        ])
        
        return all_versions