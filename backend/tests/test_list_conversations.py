"""
Test listing conversations endpoint.
Following extreme TDD - writing tests first.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import create_app
from src.models import Conversation, Participant
import uuid
from datetime import datetime


@pytest.fixture
def client():
    """Create test client."""
    app = create_app()
    return TestClient(app)


def test_list_conversations_empty(client):
    """Should return empty list when no conversations exist."""
    response = client.get("/v1/conversations")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert data["data"] == []


def test_list_conversations_with_data(client):
    """Should return list of existing conversations."""
    # Create some test conversations
    conv1 = {
        "id": str(uuid.uuid4()),
        "type": "chat",
        "title": "Test Chat 1",
        "participants": [
            {"id": str(uuid.uuid4()), "type": "human", "name": "User"}
        ],
        "messages": [],
        "createdAt": datetime.now().isoformat()
    }
    
    conv2 = {
        "id": str(uuid.uuid4()),
        "type": "wiki_tag",
        "title": "Test Wiki",
        "participants": [
            {"id": str(uuid.uuid4()), "type": "human", "name": "User"}
        ],
        "messages": [],
        "createdAt": datetime.now().isoformat()
    }
    
    # Post conversations first
    response1 = client.post("/v1/conversations", json=conv1)
    assert response1.status_code == 201
    
    response2 = client.post("/v1/conversations", json=conv2)
    assert response2.status_code == 201
    
    # Now list them
    response = client.get("/v1/conversations")
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert len(data["data"]) == 2
    
    # Check that our conversations are in the list
    ids = [c["id"] for c in data["data"]]
    assert conv1["id"] in ids
    assert conv2["id"] in ids


def test_list_conversations_persists_across_requests(client):
    """Conversations should persist across multiple requests."""
    # Create a conversation
    conv = {
        "id": str(uuid.uuid4()),
        "type": "chat",
        "title": "Persistent Chat",
        "participants": [
            {"id": str(uuid.uuid4()), "type": "human", "name": "User"}
        ],
        "messages": [],
        "createdAt": datetime.now().isoformat()
    }
    
    client.post("/v1/conversations", json=conv)
    
    # List conversations multiple times
    for _ in range(3):
        response = client.get("/v1/conversations")
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) == 1
        assert data["data"][0]["id"] == conv["id"]