"""
Final tests to achieve 100% coverage.
"""
import pytest
from fastapi.testclient import TestClient
from src.main import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


@pytest.fixture
def app_with_state():
    """Return app instance to manipulate internal state for edge cases."""
    return create_app()


class TestUncoveredBranches:
    """Test the final uncovered branches."""
    
    def test_version_navigation_with_leaf_id(self, client):
        """Test navigating to a version that has a leaf_id."""
        # Create conversation
        conv = client.post("/v1/conversations", json={
            "id": "test-version-nav",
            "type": "chat",
            "title": "Test",
            "participants": [],
            "messages": []
        }).json()
        
        # Add a message
        msg = client.post(f"/v1/conversations/{conv['id']}/messages", json={
            "author_id": "user-1",
            "content": "Original"
        }).json()
        
        # Create a branch with new content
        leaf = client.post(f"/v1/conversations/{conv['id']}/leaves", json={
            "branch_from_message_id": msg["id"],
            "name": "branch",
            "new_content": "Branched version"
        }).json()
        
        # Navigate to the branched version (index 1)
        response = client.put(f"/v1/conversations/{conv['id']}/messages/{msg['id']}/version", json={
            "version_index": 1
        })
        assert response.status_code == 200
        result = response.json()
        assert result["content"] == "Branched version"
        
        # The active leaf should have switched
        active = client.get(f"/v1/conversations/{conv['id']}/leaves/active").json()
        assert active["id"] == leaf["id"]
    
    def test_get_active_leaf_edge_cases(self, client):
        """Test edge cases in getting active leaf - normal flow."""
        # Create conversation
        conv = client.post("/v1/conversations", json={
            "id": "test-active-edge",
            "type": "chat", 
            "title": "Test",
            "participants": [],
            "messages": []
        }).json()
        
        # Normal case - should return the main leaf
        response = client.get(f"/v1/conversations/{conv['id']}/leaves/active")
        assert response.status_code == 200
        leaf = response.json()
        assert leaf["name"] == "main"
    
    def test_message_update_leaf_not_in_list(self, client):
        """Test updating message when leaf doesn't exist in leaves list."""
        # Create conversation
        conv = client.post("/v1/conversations", json={
            "id": "test-update-leaf",
            "type": "chat",
            "title": "Test",
            "participants": [],
            "messages": []
        }).json()
        
        # Add a message
        msg = client.post(f"/v1/conversations/{conv['id']}/messages", json={
            "author_id": "user-1",
            "content": "Original"
        }).json()
        
        # Update with a leaf_id that doesn't exist in leaves list
        # This should still create the version but leaf won't be found for update
        response = client.put(f"/v1/conversations/{conv['id']}/messages/{msg['id']}", json={
            "content": "Updated",
            "leaf_id": "non-existent-leaf"
        })
        assert response.status_code == 200
        
        # The version should be created but not associated with any leaf
        versions = client.get(f"/v1/conversations/{conv['id']}/messages/{msg['id']}/versions").json()
        assert len(versions["versions"]) == 2  # Original + new version
    
    def test_messages_continue_after_branch_point(self, client):
        """Test the continue statement when message in this_leaf_messages."""
        # Create conversation with messages
        conv = client.post("/v1/conversations", json={
            "id": "test-continue",
            "type": "chat",
            "title": "Test",
            "participants": [],
            "messages": []
        }).json()
        
        # Add messages
        msg1 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
            "author_id": "user-1",
            "content": "Message 1"
        }).json()
        
        msg2 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
            "author_id": "user-1", 
            "content": "Message 2"
        }).json()
        
        # Create branch from msg1
        leaf = client.post(f"/v1/conversations/{conv['id']}/leaves", json={
            "branch_from_message_id": msg1["id"],
            "name": "branch"
        }).json()
        
        # Switch to branch
        client.put(f"/v1/conversations/{conv['id']}/leaves/active", json={
            "leaf_id": leaf["id"]
        })
        
        # Add message to branch
        msg3 = client.post(f"/v1/conversations/{conv['id']}/messages", json={
            "author_id": "user-1",
            "content": "Message 3 in branch"
        }).json()
        
        # Get messages for branch - should include msg1 and msg3 but not msg2
        messages = client.get(
            f"/v1/conversations/{conv['id']}/messages",
            params={"leaf_id": leaf["id"]}
        ).json()
        
        message_contents = [m["content"] for m in messages["data"]]
        assert "Message 1" in message_contents
        assert "Message 2" not in message_contents  # After branch point, not in this leaf
        assert "Message 3 in branch" in message_contents