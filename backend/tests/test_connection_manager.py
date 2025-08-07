"""
Test ConnectionManager directly to cover all branches.
Following extreme TDD - achieving 100% coverage.
"""
import pytest
from unittest.mock import Mock
from src.main import create_app


@pytest.fixture
def app_with_manager():
    """Create app to access ConnectionManager."""
    return create_app()


def test_disconnect_from_nonexistent_conversation(app_with_manager):
    """Test disconnecting from a conversation that doesn't exist."""
    manager = app_with_manager.manager
    
    # Create a mock websocket
    mock_ws = Mock()
    
    # Call disconnect on a non-existent conversation
    # This covers the "if conversation_id in self.active_connections" false branch
    manager.disconnect(mock_ws, "non-existent-conversation-id")
    
    # Should not raise any errors and nothing should be in connections
    assert "non-existent-conversation-id" not in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast_to_nonexistent_conversation(app_with_manager):
    """Test broadcasting to a conversation with no active connections."""
    manager = app_with_manager.manager
    
    # Test broadcast to non-existent conversation
    # This covers the "if conversation_id in self.active_connections" false branch
    await manager.broadcast("test message", "non-existent-conversation")
    
    # Should not raise any errors
    assert "non-existent-conversation" not in manager.active_connections


@pytest.mark.asyncio
async def test_send_to_all_nonexistent_conversation(app_with_manager):
    """Test send_to_all to a conversation with no active connections."""
    manager = app_with_manager.manager
    
    # Test send_to_all to non-existent conversation
    await manager.send_to_all("test message", "non-existent-conversation")
    
    # Should not raise any errors
    assert "non-existent-conversation" not in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast_removes_closed_connections(app_with_manager):
    """Test that broadcast removes connections that fail to send."""
    manager = app_with_manager.manager
    
    # Create a mock websocket that raises exception when sending
    class MockClosedWebSocket:
        async def send_text(self, message):
            raise Exception("Connection closed")
    
    closed_ws = MockClosedWebSocket()
    
    # Manually add the closed connection to manager
    conversation_id = "test-conv"
    manager.active_connections[conversation_id] = [closed_ws]
    manager.user_count[conversation_id] = 1
    
    # Try to broadcast - should remove the closed connection
    await manager.broadcast("test message", conversation_id)
    
    # Verify connection was removed
    assert conversation_id not in manager.active_connections
    assert conversation_id not in manager.user_count


@pytest.mark.asyncio  
async def test_send_to_all_removes_closed_connections(app_with_manager):
    """Test that send_to_all removes connections that fail to send."""
    manager = app_with_manager.manager
    
    # Create a mock websocket that raises exception when sending
    class MockClosedWebSocket:
        async def send_text(self, message):
            raise Exception("Connection closed")
    
    closed_ws = MockClosedWebSocket()
    
    # Manually add the closed connection to manager
    conversation_id = "test-conv"
    manager.active_connections[conversation_id] = [closed_ws]
    manager.user_count[conversation_id] = 1
    
    # Try to send_to_all - should remove the closed connection
    await manager.send_to_all("test message", conversation_id)
    
    # Verify connection was removed
    assert conversation_id not in manager.active_connections
    assert conversation_id not in manager.user_count