"""
Test collaborative editing with Yjs.
Following extreme TDD - tests first!
"""
import pytest
import json
from fastapi.testclient import TestClient
from src.main import create_app
import uuid
from datetime import datetime


@pytest.fixture
def client():
    """Create test client."""
    app = create_app()
    return TestClient(app)


@pytest.fixture
def test_conversation_with_message(client):
    """Create a test conversation with an editable message."""
    conversation = {
        "id": str(uuid.uuid4()),
        "type": "chat",
        "title": "Collaborative Edit Test",
        "participants": [
            {"id": "user-1", "type": "human", "name": "Alice"},
            {"id": "user-2", "type": "human", "name": "Bob"}
        ],
        "messages": [],
        "createdAt": datetime.now().isoformat()
    }
    response = client.post("/v1/conversations", json=conversation)
    conv = response.json()
    
    # Add a message to edit
    message_data = {
        "author_id": "user-1",
        "content": "This is the original message that we will edit collaboratively"
    }
    response = client.post(f"/v1/conversations/{conv['id']}/messages", json=message_data)
    message = response.json()
    
    return conv, message


class TestCollaborativeEditing:
    """Test collaborative editing features (simplified - no Yjs)."""
    
    def test_start_editing_session(self, client, test_conversation_with_message):
        """Should start an editing session for a message."""
        conv, message = test_conversation_with_message
        
        with client.websocket_connect(f"/v1/conversations/{conv['id']}/ws") as websocket:
            # Skip connection message
            websocket.receive_json()
            
            # Start editing a message
            websocket.send_json({
                "type": "start_editing",
                "messageId": message["id"],
                "userId": "user-1"
            })
            
            # Should receive confirmation
            response = websocket.receive_json()
            assert response["type"] == "editing_started"
            assert response["messageId"] == message["id"]
            assert response["userId"] == "user-1"
    
    def test_broadcast_editing_status(self, client, test_conversation_with_message):
        """Should broadcast when someone starts/stops editing."""
        conv, message = test_conversation_with_message
        
        with client.websocket_connect(f"/v1/conversations/{conv['id']}/ws") as ws1:
            with client.websocket_connect(f"/v1/conversations/{conv['id']}/ws") as ws2:
                # Skip connection messages
                ws1.receive_json()
                ws2.receive_json()
                ws1.receive_json()  # presence update
                
                # User 1 starts editing
                ws1.send_json({
                    "type": "start_editing",
                    "messageId": message["id"],
                    "userId": "user-1"
                })
                
                # Both should receive the update
                ws1_response = ws1.receive_json()
                ws2_response = ws2.receive_json()
                
                assert ws2_response["type"] == "editing_started"
                assert ws2_response["userId"] == "user-1"
    
    
    def test_stop_editing_session(self, client, test_conversation_with_message):
        """Should stop editing session and clean up."""
        conv, message = test_conversation_with_message
        
        with client.websocket_connect(f"/v1/conversations/{conv['id']}/ws") as websocket:
            # Skip connection message
            websocket.receive_json()
            
            # Start editing
            websocket.send_json({
                "type": "start_editing",
                "messageId": message["id"],
                "userId": "user-1"
            })
            websocket.receive_json()  # editing_started
            
            # Stop editing
            websocket.send_json({
                "type": "stop_editing",
                "messageId": message["id"],
                "userId": "user-1"
            })
            
            # Should receive confirmation
            response = websocket.receive_json()
            assert response["type"] == "editing_stopped"
            assert response["messageId"] == message["id"]
            assert response["userId"] == "user-1"
    
    def test_get_active_editors(self, client, test_conversation_with_message):
        """Should return list of users currently editing."""
        conv, message = test_conversation_with_message
        
        # Start editing with one user
        with client.websocket_connect(f"/v1/conversations/{conv['id']}/ws") as ws1:
            ws1.receive_json()  # connection
            
            ws1.send_json({
                "type": "start_editing",
                "messageId": message["id"],
                "userId": "user-1"
            })
            ws1.receive_json()  # editing_started
            
            # Query active editors
            response = client.get(f"/v1/conversations/{conv['id']}/messages/{message['id']}/editors")
            assert response.status_code == 200
            editors = response.json()
            assert "user-1" in editors["editors"]