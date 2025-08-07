import pytest
from fastapi.testclient import TestClient
from src.main import create_app

@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)

def test_get_or_create_wiki_conversation_creates_new(client):
    """Should create a new wiki conversation if it doesn't exist."""
    concept = "React Native"
    response = client.get(f"/v1/wiki/{concept}")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["id"] == "wiki-react-native"
    assert data["type"] == "wiki"
    assert data["title"] == "React Native"
    assert data["messages"] == []

def test_get_or_create_wiki_conversation_returns_existing(client):
    """Should return existing wiki conversation if it exists."""
    concept = "Python"
    
    # First call creates it
    response1 = client.get(f"/v1/wiki/{concept}")
    assert response1.status_code == 200
    wiki1 = response1.json()
    
    # Add a message to it
    client.post(f"/v1/conversations/{wiki1['id']}/messages", json={
        "author_id": "wiki-editor",
        "content": "Python is a programming language"
    })
    
    # Second call should return the same conversation with the message
    response2 = client.get(f"/v1/wiki/{concept}")
    assert response2.status_code == 200
    wiki2 = response2.json()
    
    assert wiki2["id"] == wiki1["id"]
    assert len(wiki2["messages"]) == 1
    assert wiki2["messages"][0]["content"] == "Python is a programming language"

def test_wiki_concept_normalization(client):
    """Should normalize concept names to create consistent IDs."""
    # Test that spaces are replaced with hyphens and lowercase
    response1 = client.get("/v1/wiki/Machine Learning")
    response2 = client.get("/v1/wiki/machine learning")
    response3 = client.get("/v1/wiki/Machine%20Learning")
    
    wiki1 = response1.json()
    wiki2 = response2.json()
    wiki3 = response3.json()
    
    # All should return the same wiki conversation
    assert wiki1["id"] == "wiki-machine-learning"
    assert wiki2["id"] == "wiki-machine-learning"
    assert wiki3["id"] == "wiki-machine-learning"

def test_wiki_with_special_characters(client):
    """Should handle special characters in concept names."""
    concept = "C++"
    response = client.get(f"/v1/wiki/{concept}")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["id"] == "wiki-c++"
    assert data["title"] == "C++"
    assert data["type"] == "wiki"