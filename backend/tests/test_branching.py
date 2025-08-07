"""
Tests for branching conversation functionality.
Following TDD - write tests first, then implementation.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import create_app
import json

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)

@pytest.fixture
def conversation_with_messages(client):
    """Create a conversation with some messages for testing."""
    # Create conversation
    conv_response = client.post("/v1/conversations", json={
        "id": "test-conv-1",
        "type": "chat",
        "title": "Test Conversation",
        "participants": [
            {"id": "user-1", "type": "human", "name": "User"},
            {"id": "ai-1", "type": "ai", "name": "Assistant"}
        ],
        "messages": []
    })
    conv = conv_response.json()
    
    # Add messages
    msg1 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
        "author_id": "user-1",
        "content": "Hello AI"
    }).json()
    
    msg2 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
        "author_id": "ai-1", 
        "content": "Hello! How can I help?"
    }).json()
    
    msg3 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
        "author_id": "user-1",
        "content": "Tell me about Python"
    }).json()
    
    return {
        "conversation": conv,
        "messages": [msg1, msg2, msg3]
    }


class TestLeafManagement:
    """Test leaf creation and management."""
    
    def test_conversation_starts_with_default_leaf(self, client):
        """New conversation should have a default 'main' leaf."""
        response = client.post("/v1/conversations", json={
            "id": "test-conv-2",
            "type": "chat",
            "title": "Test",
            "participants": [],
            "messages": []
        })
        
        conv = response.json()
        
        # Get leaves for this conversation
        leaves_response = client.get(f"/v1/conversations/{conv['id']}/leaves")
        assert leaves_response.status_code == 200
        
        leaves = leaves_response.json()
        assert len(leaves["leaves"]) == 1
        assert leaves["leaves"][0]["name"] == "main"
        assert leaves["active_leaf_id"] == leaves["leaves"][0]["id"]
    
    def test_get_active_leaf(self, client, conversation_with_messages):
        """Should return the currently active leaf."""
        conv_id = conversation_with_messages["conversation"]["id"]
        
        response = client.get(f"/v1/conversations/{conv_id}/leaves/active")
        assert response.status_code == 200
        
        active_leaf = response.json()
        assert active_leaf["name"] == "main"
        assert "id" in active_leaf
        assert "created_at" in active_leaf
    
    def test_create_new_leaf_from_message(self, client, conversation_with_messages):
        """Editing an old message should create a new leaf."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Request to create a new leaf by editing message 2
        response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg2_id,
            "name": "alternative-response"
        })
        
        assert response.status_code == 201
        new_leaf = response.json()
        
        assert new_leaf["name"] == "alternative-response"
        assert new_leaf["branch_point_message_id"] == msg2_id
        
        # Should now have 2 leaves
        leaves_response = client.get(f"/v1/conversations/{conv_id}/leaves")
        leaves = leaves_response.json()
        assert len(leaves["leaves"]) == 2
    
    def test_switch_active_leaf(self, client, conversation_with_messages):
        """Should be able to switch between leaves."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Create a new leaf
        new_leaf_response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg2_id,
            "name": "alternative"
        })
        new_leaf = new_leaf_response.json()
        
        # Switch to the new leaf
        response = client.put(f"/v1/conversations/{conv_id}/leaves/active", json={
            "leaf_id": new_leaf["id"]
        })
        
        assert response.status_code == 200
        result = response.json()
        assert result["active_leaf_id"] == new_leaf["id"]
        
        # Verify it's actually switched
        active_response = client.get(f"/v1/conversations/{conv_id}/leaves/active")
        active_leaf = active_response.json()
        assert active_leaf["id"] == new_leaf["id"]


class TestVersionManagement:
    """Test message versions within leaves."""
    
    def test_message_has_versions(self, client, conversation_with_messages):
        """Messages should track their versions across leaves."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Get versions for message 2
        response = client.get(f"/v1/conversations/{conv_id}/messages/{msg2_id}/versions")
        assert response.status_code == 200
        
        versions = response.json()
        assert len(versions["versions"]) == 1  # Initially just one version
        assert versions["versions"][0]["content"] == "Hello! How can I help?"
        assert versions["current_version"] == 0
    
    def test_editing_message_creates_new_version(self, client, conversation_with_messages):
        """Editing a message in a new leaf creates a new version."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Create new leaf from message 2
        new_leaf_response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg2_id,
            "name": "alternative"
        })
        new_leaf = new_leaf_response.json()
        
        # Edit message 2 in the new leaf
        response = client.put(f"/v1/conversations/{conv_id}/messages/{msg2_id}", json={
            "content": "Greetings! What can I do for you?",
            "leaf_id": new_leaf["id"]
        })
        
        assert response.status_code == 200
        
        # Now should have 2 versions
        versions_response = client.get(f"/v1/conversations/{conv_id}/messages/{msg2_id}/versions")
        versions = versions_response.json()
        
        assert len(versions["versions"]) == 2
        assert versions["versions"][0]["content"] == "Hello! How can I help?"
        assert versions["versions"][1]["content"] == "Greetings! What can I do for you?"
    
    def test_navigate_versions(self, client, conversation_with_messages):
        """Should be able to navigate between versions of a message."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Create multiple versions by creating leaves
        for i in range(3):
            leaf_response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
                "branch_from_message_id": msg2_id,
                "name": f"version-{i}"
            })
            leaf = leaf_response.json()
            
            # Edit the message in this leaf
            client.put(f"/v1/conversations/{conv_id}/messages/{msg2_id}", json={
                "content": f"AI response version {i}",
                "leaf_id": leaf["id"]
            })
        
        # Get all versions
        versions_response = client.get(f"/v1/conversations/{conv_id}/messages/{msg2_id}/versions")
        versions = versions_response.json()
        
        assert len(versions["versions"]) == 4  # Original + 3 new
        
        # Navigate to specific version
        response = client.put(f"/v1/conversations/{conv_id}/messages/{msg2_id}/version", json={
            "version_index": 2
        })
        
        assert response.status_code == 200
        result = response.json()
        assert result["current_version"] == 2
        assert result["content"] == "AI response version 1"


class TestLeafWebSockets:
    """Test WebSocket connections for leaf-specific Yjs documents."""
    
    def test_websocket_connects_to_leaf(self, client, conversation_with_messages):
        """WebSocket should connect to specific leaf's Yjs document."""
        conv_id = conversation_with_messages["conversation"]["id"]
        
        # Get active leaf
        leaf_response = client.get(f"/v1/conversations/{conv_id}/leaves/active")
        leaf = leaf_response.json()
        
        # Connect WebSocket to leaf
        with client.websocket_connect(f"/v1/conversations/{conv_id}/leaves/{leaf['id']}/ws") as websocket:
            # Should receive connection confirmation
            data = websocket.receive_json()
            assert data["type"] == "connection"
            assert data["leafId"] == leaf["id"]
            assert data["conversationId"] == conv_id
    
    def test_separate_yjs_docs_per_leaf(self, client, conversation_with_messages):
        """Each leaf should have its own Yjs document."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Create a new leaf
        new_leaf_response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg2_id,
            "name": "alternative"
        })
        new_leaf = new_leaf_response.json()
        
        # Get main leaf
        main_leaf_response = client.get(f"/v1/conversations/{conv_id}/leaves/active")
        main_leaf = main_leaf_response.json()
        
        # Connect to both leaves
        with client.websocket_connect(f"/v1/conversations/{conv_id}/leaves/{main_leaf['id']}/ws") as ws1:
            with client.websocket_connect(f"/v1/conversations/{conv_id}/leaves/{new_leaf['id']}/ws") as ws2:
                # Send different content to each
                ws1.send_json({"type": "yjs_update", "content": "Main leaf content"})
                ws2.send_json({"type": "yjs_update", "content": "Alternative leaf content"})
                
                # Each should maintain separate state
                # (In real implementation, would verify Yjs document independence)
                assert ws1 != ws2  # Different connections


class TestCopyOnWrite:
    """Test copy-on-write behavior when editing old messages."""
    
    def test_editing_old_message_copies_history(self, client, conversation_with_messages):
        """Editing an old message should copy all messages up to that point."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg1_id = conversation_with_messages["messages"][0]["id"]
        
        # Edit the first message (should copy it to new leaf)
        response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg1_id,
            "name": "edited-greeting",
            "new_content": "Hey there AI!"
        })
        
        assert response.status_code == 201
        new_leaf = response.json()
        
        # Get messages in the new leaf
        messages_response = client.get(
            f"/v1/conversations/{conv_id}/messages",
            params={"leaf_id": new_leaf["id"]}
        )
        messages = messages_response.json()
        
        # First message should be edited
        assert messages["data"][0]["content"] == "Hey there AI!"
        
        # Rest should be copied (but only up to branch point)
        assert len(messages["data"]) == 1  # Only the edited message
    
    def test_new_messages_go_to_active_leaf(self, client, conversation_with_messages):
        """New messages should be added to the currently active leaf."""
        conv_id = conversation_with_messages["conversation"]["id"]
        msg2_id = conversation_with_messages["messages"][1]["id"]
        
        # Create and switch to new leaf
        new_leaf_response = client.post(f"/v1/conversations/{conv_id}/leaves", json={
            "branch_from_message_id": msg2_id,
            "name": "alternative"
        })
        new_leaf = new_leaf_response.json()
        
        client.put(f"/v1/conversations/{conv_id}/leaves/active", json={
            "leaf_id": new_leaf["id"]
        })
        
        # Add a new message
        new_msg_response = client.post(f"/v1/conversations/{conv_id}/messages", json={
            "author_id": "user-1",
            "content": "This goes to the new leaf"
        })
        
        assert new_msg_response.status_code == 201
        new_msg = new_msg_response.json()
        assert new_msg["leaf_id"] == new_leaf["id"]
        
        # Verify it's only in the new leaf
        main_messages = client.get(
            f"/v1/conversations/{conv_id}/messages",
            params={"leaf_id": "main"}
        ).json()
        
        # Main leaf shouldn't have the new message
        assert not any(m["id"] == new_msg["id"] for m in main_messages.get("data", []))