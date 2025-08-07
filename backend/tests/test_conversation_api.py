"""
Test-first development: These tests define the API behavior before implementation.
Following extreme TDD - tests are written BEFORE any production code.
"""
import pytest
from httpx import AsyncClient
from datetime import datetime
from typing import Any, Dict
import uuid


class TestConversationAPI:
    """Test the core conversation API - the foundation of everything."""

    @pytest.mark.asyncio
    async def test_create_conversation_returns_valid_conversation(
        self, client: AsyncClient
    ) -> None:
        """Creating a conversation should return a properly structured conversation object."""
        # Arrange
        conversation_data = {
            "title": "Test Conversation",
            "type": "chat",
            "participants": [
                {"id": str(uuid.uuid4()), "type": "human", "name": "Alice"}
            ],
        }

        # Act
        response = await client.post("/v1/conversations", json=conversation_data)

        # Assert
        assert response.status_code == 201
        data = response.json()
        
        # Verify structure matches our design
        assert "id" in data
        assert data["type"] == "chat"
        assert data["title"] == "Test Conversation"
        assert len(data["participants"]) == 1
        assert data["participants"][0]["name"] == "Alice"
        assert "created_at" in data
        assert "messages" in data
        assert data["messages"] == []  # New conversation has no messages

    @pytest.mark.asyncio
    async def test_create_conversation_validates_empty_title(
        self, client: AsyncClient
    ) -> None:
        """Empty titles should be rejected with proper error."""
        # Arrange
        conversation_data = {
            "title": "",  # Empty title
            "type": "chat",
            "participants": [],
        }

        # Act
        response = await client.post("/v1/conversations", json=conversation_data)

        # Assert
        assert response.status_code == 422
        error = response.json()
        assert "title" in str(error["detail"]).lower()

    @pytest.mark.asyncio
    async def test_get_conversation_returns_existing_conversation(
        self, client: AsyncClient
    ) -> None:
        """Retrieving a conversation should return the full conversation object."""
        # Arrange - first create a conversation
        create_response = await client.post(
            "/v1/conversations",
            json={
                "title": "Retrievable Conversation",
                "type": "chat",
                "participants": [],
            },
        )
        conversation_id = create_response.json()["id"]

        # Act
        response = await client.get(f"/v1/conversations/{conversation_id}")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == conversation_id
        assert data["title"] == "Retrievable Conversation"

    @pytest.mark.asyncio
    async def test_get_nonexistent_conversation_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Requesting a non-existent conversation should return 404."""
        # Arrange
        fake_id = str(uuid.uuid4())

        # Act
        response = await client.get(f"/v1/conversations/{fake_id}")

        # Assert
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    @pytest.mark.asyncio
    async def test_add_message_to_conversation(self, client: AsyncClient) -> None:
        """Adding a message to a conversation should update the conversation."""
        # Arrange - create conversation first
        create_response = await client.post(
            "/v1/conversations",
            json={
                "title": "Message Test",
                "type": "chat",
                "participants": [
                    {"id": str(uuid.uuid4()), "type": "human", "name": "Bob"}
                ],
            },
        )
        conversation_id = create_response.json()["id"]
        participant_id = create_response.json()["participants"][0]["id"]

        message_data = {
            "content": "Hello, world!",
            "author_id": participant_id,
        }

        # Act
        response = await client.post(
            f"/v1/conversations/{conversation_id}/messages", json=message_data
        )

        # Assert
        assert response.status_code == 201
        message = response.json()
        assert message["content"] == "Hello, world!"
        assert message["author_id"] == participant_id
        assert "id" in message
        assert "created_at" in message

    @pytest.mark.asyncio
    async def test_update_message_in_conversation(self, client: AsyncClient) -> None:
        """Updating a message should modify its content and broadcast to WebSocket clients."""
        # Arrange - create conversation and message first
        create_response = await client.post(
            "/v1/conversations",
            json={
                "title": "Update Test",
                "type": "chat", 
                "participants": [
                    {"id": str(uuid.uuid4()), "type": "human", "name": "Alice"}
                ],
            },
        )
        conversation_id = create_response.json()["id"]
        participant_id = create_response.json()["participants"][0]["id"]

        message_response = await client.post(
            f"/v1/conversations/{conversation_id}/messages",
            json={"content": "Original content", "author_id": participant_id}
        )
        message_id = message_response.json()["id"]

        # Act - update the message
        update_data = {"content": "Updated content"}
        response = await client.put(
            f"/v1/conversations/{conversation_id}/messages/{message_id}",
            json=update_data
        )

        # Assert
        assert response.status_code == 200
        updated_message = response.json()
        assert updated_message["content"] == "Updated content"
        assert updated_message["id"] == message_id
        assert updated_message["author_id"] == participant_id

        # Verify message was updated in conversation
        conversation_response = await client.get(f"/v1/conversations/{conversation_id}")
        conversation = conversation_response.json()
        assert len(conversation["messages"]) == 1
        assert conversation["messages"][0]["content"] == "Updated content"

    @pytest.mark.asyncio
    async def test_update_message_nonexistent_conversation_returns_404(self, client: AsyncClient) -> None:
        """Updating a message in non-existent conversation should return 404."""
        fake_conv_id = str(uuid.uuid4())
        fake_msg_id = str(uuid.uuid4())

        response = await client.put(
            f"/v1/conversations/{fake_conv_id}/messages/{fake_msg_id}",
            json={"content": "New content"}
        )

        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    @pytest.mark.asyncio
    async def test_update_nonexistent_message_returns_404(self, client: AsyncClient) -> None:
        """Updating a non-existent message should return 404."""
        # Arrange - create conversation first
        create_response = await client.post(
            "/v1/conversations",
            json={
                "title": "Test",
                "type": "chat",
                "participants": [
                    {"id": str(uuid.uuid4()), "type": "human", "name": "Bob"}
                ],
            },
        )
        conversation_id = create_response.json()["id"]
        fake_msg_id = str(uuid.uuid4())

        # Act
        response = await client.put(
            f"/v1/conversations/{conversation_id}/messages/{fake_msg_id}",
            json={"content": "New content"}
        )

        # Assert
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    @pytest.mark.asyncio
    async def test_update_message_without_content_field(self, client: AsyncClient) -> None:
        """Updating a message without content field should not change content."""
        # Arrange - create conversation and message first
        create_response = await client.post(
            "/v1/conversations",
            json={
                "title": "No Content Test",
                "type": "chat",
                "participants": [
                    {"id": str(uuid.uuid4()), "type": "human", "name": "Charlie"}
                ],
            },
        )
        conversation_id = create_response.json()["id"]
        participant_id = create_response.json()["participants"][0]["id"]

        message_response = await client.post(
            f"/v1/conversations/{conversation_id}/messages",
            json={"content": "Original content", "author_id": participant_id}
        )
        message_id = message_response.json()["id"]

        # Act - update without content field
        response = await client.put(
            f"/v1/conversations/{conversation_id}/messages/{message_id}",
            json={"other_field": "ignored"}  # No 'content' field
        )

        # Assert
        assert response.status_code == 200
        updated_message = response.json()
        assert updated_message["content"] == "Original content"  # Should remain unchanged
        assert updated_message["id"] == message_id

    @pytest.mark.asyncio
    async def test_wiki_tag_creates_special_conversation(
        self, client: AsyncClient
    ) -> None:
        """Wiki tags should create special conversations with type='wiki_tag'."""
        # Arrange
        tag_data = {
            "title": "[[machine-learning]]",
            "type": "wiki_tag",
            "participants": [],
            "metadata": {"wiki_tag": "machine-learning"},
        }

        # Act
        response = await client.post("/v1/conversations", json=tag_data)

        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data["type"] == "wiki_tag"
        assert data["metadata"]["wiki_tag"] == "machine-learning"

    @pytest.mark.asyncio
    async def test_add_message_to_nonexistent_conversation_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Adding a message to a non-existent conversation should return 404."""
        # Arrange
        fake_conversation_id = str(uuid.uuid4())
        message_data = {
            "content": "Hello!",
            "author_id": str(uuid.uuid4()),
        }
        
        # Act
        response = await client.post(
            f"/v1/conversations/{fake_conversation_id}/messages", json=message_data
        )
        
        # Assert
        assert response.status_code == 404
        error = response.json()
        assert "not found" in error["detail"].lower()

    @pytest.mark.asyncio
    async def test_openai_compatible_completions_endpoint(
        self, client: AsyncClient
    ) -> None:
        """The /v1/chat/completions endpoint should be OpenAI-compatible."""
        # Arrange
        completion_request = {
            "messages": [
                {"role": "user", "content": "Hello!"},
            ],
            "model": "gpt-3.5-turbo",  # We'll mock this
            "conversation_id": str(uuid.uuid4()),  # Our extension
        }

        # Act
        response = await client.post("/v1/chat/completions", json=completion_request)

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert "choices" in data
        assert len(data["choices"]) > 0
        assert "message" in data["choices"][0]
        assert data["choices"][0]["message"]["role"] == "assistant"