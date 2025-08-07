"""
Test edge cases for collaborative editing to achieve 100% coverage.
"""
import pytest
from unittest.mock import Mock
from src.main import create_app
from fastapi.testclient import TestClient
import uuid
from datetime import datetime


def test_stop_editing_nonexistent_session():
    """Test stopping editing for a message that's not being edited."""
    app = create_app()
    manager = app.manager
    
    # Stop editing a non-existent session
    # This covers the branch where message_id is not in editing_sessions
    manager.stop_editing("non-existent-message", "user-1")
    
    # Should not raise any errors
    assert "non-existent-message" not in manager.editing_sessions


def test_get_editors_nonexistent_message():
    """Test getting editors for a message with no editing session."""
    app = create_app()
    manager = app.manager
    
    # Get editors for non-existent message
    editors = manager.get_editors("non-existent-message")
    
    # Should return empty list
    assert editors == []


def test_get_active_editors_nonexistent_conversation():
    """Test REST endpoint with non-existent conversation."""
    app = create_app()
    client = TestClient(app)
    
    response = client.get("/v1/conversations/fake-id/messages/fake-msg/editors")
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"


def test_get_active_editors_nonexistent_message():
    """Test REST endpoint with non-existent message."""
    app = create_app()
    client = TestClient(app)
    
    # Create a conversation first
    conversation = {
        "id": str(uuid.uuid4()),
        "type": "chat",
        "title": "Test",
        "participants": [{"id": "user-1", "type": "human", "name": "User"}],
        "messages": [],
        "createdAt": datetime.now().isoformat()
    }
    client.post("/v1/conversations", json=conversation)
    
    # Try to get editors for non-existent message
    response = client.get(f"/v1/conversations/{conversation['id']}/messages/fake-msg/editors")
    assert response.status_code == 404
    assert response.json()["detail"] == "Message not found"


def test_start_editing_existing_session():
    """Test starting editing when session already exists."""
    app = create_app()
    manager = app.manager
    
    # Start editing first time
    manager.start_editing("msg-1", "user-1")
    assert "user-1" in manager.editing_sessions["msg-1"]
    
    # Start editing same message with different user
    # This covers the branch where message_id already exists
    manager.start_editing("msg-1", "user-2")
    assert "user-1" in manager.editing_sessions["msg-1"]
    assert "user-2" in manager.editing_sessions["msg-1"]
    assert len(manager.editing_sessions["msg-1"]) == 2


def test_stop_editing_with_other_users_still_editing():
    """Test stopping editing when other users are still editing."""
    app = create_app()
    manager = app.manager
    
    # Start editing with two users
    manager.start_editing("msg-1", "user-1")
    manager.start_editing("msg-1", "user-2")
    
    # Stop editing for one user
    # This covers the branch where editing_sessions[message_id] is not empty after removal
    manager.stop_editing("msg-1", "user-1")
    
    # Session should still exist with user-2
    assert "msg-1" in manager.editing_sessions
    assert "user-2" in manager.editing_sessions["msg-1"]
    assert "user-1" not in manager.editing_sessions["msg-1"]