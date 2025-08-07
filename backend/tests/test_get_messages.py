import pytest
from fastapi.testclient import TestClient
from src.main import create_app

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)

@pytest.fixture  
def test_conversation(client):
    # Create a conversation with some messages
    response = client.post("/v1/conversations", json={
        "title": "Test Chat",
        "type": "chat"
    })
    assert response.status_code == 201
    conversation = response.json()
    
    # Add some messages
    client.post(f"/v1/conversations/{conversation['id']}/messages", json={
        "author_id": "user-1",
        "content": "Hello [[React Native]] world!"
    })
    
    client.post(f"/v1/conversations/{conversation['id']}/messages", json={
        "author_id": "ai-1", 
        "content": "I love [[machine learning]] and [[React Native]] development."
    })
    
    return conversation

def test_get_messages_success(client, test_conversation):
    """Should return all messages from a conversation."""
    conversation_id = test_conversation["id"]
    
    response = client.get(f"/v1/conversations/{conversation_id}/messages")
    
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) == 2
    
    # Check message content
    messages = data["data"]
    assert messages[0]["content"] == "Hello [[React Native]] world!"
    assert messages[0]["author_id"] == "user-1"
    assert messages[1]["content"] == "I love [[machine learning]] and [[React Native]] development."
    assert messages[1]["author_id"] == "ai-1"

def test_get_messages_conversation_not_found(client):
    """Should return 404 for non-existent conversation."""
    response = client.get("/v1/conversations/nonexistent/messages")
    
    assert response.status_code == 404
    assert response.json()["detail"] == "Conversation not found"

def test_get_messages_empty_conversation(client):
    """Should return empty array for conversation with no messages."""
    # Create conversation without messages
    response = client.post("/v1/conversations", json={
        "title": "Empty Chat",
        "type": "chat"
    })
    assert response.status_code == 201
    conversation = response.json()
    
    # Get messages
    response = client.get(f"/v1/conversations/{conversation['id']}/messages")
    
    assert response.status_code == 200
    data = response.json()
    assert data["data"] == []