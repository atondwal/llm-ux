"""
Database models and connection setup.
"""
from sqlalchemy import create_engine, Column, String, DateTime, Text, JSON, ForeignKey, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.sql import func
from datetime import datetime
import os
from typing import Optional

# Database URL - use PostgreSQL in production, SQLite for development
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "sqlite+aiosqlite:///./llm_ux.db"  # SQLite for easy local testing
)

# For PostgreSQL, use:
# DATABASE_URL = "postgresql+asyncpg://user:password@localhost/llm_ux"

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=True,  # Log SQL statements for debugging
)

# Create async session factory
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for models
Base = declarative_base()


class ConversationDB(Base):
    """Database model for conversations."""
    __tablename__ = "conversations"
    
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False, default="chat")
    title = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    messages = relationship("MessageDB", back_populates="conversation", cascade="all, delete-orphan")
    participants = relationship("ParticipantDB", back_populates="conversation", cascade="all, delete-orphan")
    leaves = relationship("LeafDB", back_populates="conversation", cascade="all, delete-orphan")


class MessageDB(Base):
    """Database model for messages."""
    __tablename__ = "messages"
    
    id = Column(String, primary_key=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    author_id = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Store which leaf this message was created in
    created_in_leaf_id = Column(String, ForeignKey("leaves.id"), nullable=True)
    
    # Relationships
    conversation = relationship("ConversationDB", back_populates="messages")
    versions = relationship("MessageVersionDB", back_populates="message", cascade="all, delete-orphan")
    created_in_leaf = relationship("LeafDB", back_populates="created_messages", foreign_keys=[created_in_leaf_id])


class ParticipantDB(Base):
    """Database model for conversation participants."""
    __tablename__ = "participants"
    
    # Use composite primary key of participant_id + conversation_id
    id = Column(Integer, primary_key=True, autoincrement=True)
    participant_id = Column(String, nullable=False)  # The actual participant ID like "user-1"
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    type = Column(String, nullable=False)  # "human" or "ai"
    name = Column(String, nullable=False)
    
    # Relationships
    conversation = relationship("ConversationDB", back_populates="participants")


class LeafDB(Base):
    """Database model for conversation branches/leaves."""
    __tablename__ = "leaves"
    
    id = Column(String, primary_key=True)
    conversation_id = Column(String, ForeignKey("conversations.id"), nullable=False)
    name = Column(String, nullable=False)
    branch_point_message_id = Column(String, ForeignKey("messages.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # JSON field to store message version mappings {message_id: version_index}
    message_versions = Column(JSON, default={})
    
    # Track if this is the active leaf
    is_active = Column(String, default="false")  # SQLite doesn't have boolean, use string
    
    # Relationships
    conversation = relationship("ConversationDB", back_populates="leaves")
    branch_point_message = relationship("MessageDB", foreign_keys=[branch_point_message_id])
    created_messages = relationship("MessageDB", back_populates="created_in_leaf", foreign_keys="MessageDB.created_in_leaf_id")


class MessageVersionDB(Base):
    """Database model for message versions."""
    __tablename__ = "message_versions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String, ForeignKey("messages.id"), nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(String, nullable=False)
    leaf_id = Column(String, ForeignKey("leaves.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    message = relationship("MessageDB", back_populates="versions")
    leaf = relationship("LeafDB")


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)