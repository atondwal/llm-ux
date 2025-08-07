"""
Test-first type definitions using Pydantic.
These tests define our data model contracts before implementation.
"""
import pytest
from datetime import datetime
from typing import Any
import uuid
from pydantic import ValidationError


class TestConversationModel:
    """Test the Conversation model matches our design."""

    def test_conversation_model_validates_required_fields(self) -> None:
        """Conversation must have all required fields."""
        from src.models import Conversation, Participant
        
        # Arrange
        participant = Participant(
            id=str(uuid.uuid4()),
            type="human",
            name="Alice"
        )
        
        # Act & Assert - valid conversation
        conversation = Conversation(
            id=str(uuid.uuid4()),
            type="chat",
            title="Test Chat",
            participants=[participant],
            messages=[],
            created_at=datetime.now()
        )
        
        assert conversation.type == "chat"
        assert conversation.title == "Test Chat"
        assert len(conversation.participants) == 1

    def test_conversation_rejects_empty_title(self) -> None:
        """Empty titles should be rejected."""
        from src.models import Conversation
        
        # Arrange & Act & Assert
        with pytest.raises(ValidationError) as exc_info:
            Conversation(
                id=str(uuid.uuid4()),
                type="chat",
                title="",  # Empty title
                participants=[],
                messages=[],
                created_at=datetime.now()
            )
        
        assert "title" in str(exc_info.value).lower()

    def test_participant_model_validates_type(self) -> None:
        """Participant type must be 'human' or 'ai'."""
        from src.models import Participant
        
        # Valid types
        human = Participant(
            id=str(uuid.uuid4()),
            type="human",
            name="Bob"
        )
        assert human.type == "human"
        
        ai = Participant(
            id=str(uuid.uuid4()),
            type="ai",
            name="Claude"
        )
        assert ai.type == "ai"
        
        # Invalid type
        with pytest.raises(ValidationError):
            Participant(
                id=str(uuid.uuid4()),
                type="robot",  # Invalid
                name="R2D2"
            )
    
    def test_participant_rejects_empty_name(self) -> None:
        """Participant name cannot be empty."""
        from src.models import Participant
        
        # Empty name should fail
        with pytest.raises(ValidationError) as exc_info:
            Participant(
                id=str(uuid.uuid4()),
                type="human",
                name=""  # Empty name
            )
        
        assert "name" in str(exc_info.value).lower()

    def test_message_model_validates_content(self) -> None:
        """Message content cannot be empty."""
        from src.models import Message
        
        # Valid message
        message = Message(
            id=str(uuid.uuid4()),
            conversation_id=str(uuid.uuid4()),
            author_id=str(uuid.uuid4()),
            content="Hello, world!",
            created_at=datetime.now()
        )
        assert message.content == "Hello, world!"
        
        # Empty content should fail
        with pytest.raises(ValidationError) as exc_info:
            Message(
                id=str(uuid.uuid4()),
                conversation_id=str(uuid.uuid4()),
                author_id=str(uuid.uuid4()),
                content="",  # Empty
                created_at=datetime.now()
            )
        
        assert "content" in str(exc_info.value).lower()

    def test_wiki_tag_conversation_has_metadata(self) -> None:
        """Wiki tag conversations should have wiki_tag in metadata."""
        from src.models import Conversation
        
        wiki_conversation = Conversation(
            id=str(uuid.uuid4()),
            type="wiki_tag",
            title="[[machine-learning]]",
            participants=[],
            messages=[],
            created_at=datetime.now(),
            metadata={"wiki_tag": "machine-learning"}
        )
        
        assert wiki_conversation.type == "wiki_tag"
        assert wiki_conversation.metadata is not None
        assert wiki_conversation.metadata["wiki_tag"] == "machine-learning"


class TestOpenAICompatibility:
    """Test OpenAI-compatible request/response models."""

    def test_chat_completion_request_model(self) -> None:
        """Test OpenAI-compatible chat completion request."""
        from src.models import ChatCompletionRequest, ChatMessage
        
        request = ChatCompletionRequest(
            messages=[
                ChatMessage(role="user", content="Hello!"),
                ChatMessage(role="assistant", content="Hi there!"),
            ],
            model="gpt-3.5-turbo",
            conversation_id=str(uuid.uuid4())  # Our extension
        )
        
        assert len(request.messages) == 2
        assert request.messages[0].role == "user"
        assert request.model == "gpt-3.5-turbo"

    def test_chat_completion_response_model(self) -> None:
        """Test OpenAI-compatible chat completion response."""
        from src.models import ChatCompletionResponse, Choice, ChatMessage
        
        response = ChatCompletionResponse(
            id="chatcmpl-123",
            object="chat.completion",
            created=int(datetime.now().timestamp()),
            model="gpt-3.5-turbo",
            choices=[
                Choice(
                    index=0,
                    message=ChatMessage(role="assistant", content="Hello!"),
                    finish_reason="stop"
                )
            ]
        )
        
        assert response.object == "chat.completion"
        assert len(response.choices) == 1
        assert response.choices[0].message.content == "Hello!"