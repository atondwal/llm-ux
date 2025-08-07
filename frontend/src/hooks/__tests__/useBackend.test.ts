/**
 * Tests for useBackend hook.
 * Following TDD - tests first!
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useBackend } from '../useBackend';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
class MockWebSocket {
  readyState = 0; // CONNECTING
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  
  send = jest.fn();
  close = jest.fn();
  
  // Simulate connection
  connect() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen({});
  }
  
  // Simulate receiving a message
  receiveMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

global.WebSocket = MockWebSocket as any;

describe('useBackend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock fetch by default to avoid errors
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    });
  });

  it('should load conversations from backend', async () => {
    const mockConversations = [
      {
        id: 'conv-1',
        type: 'chat',
        title: 'Test Chat',
        participants: [],
        messages: [],
        created_at: new Date().toISOString()
      }
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockConversations })
    });

    const { result } = renderHook(() => useBackend());

    await waitFor(() => {
      expect(result.current.conversations).toEqual(mockConversations);
    });
  });

  it('should connect WebSocket for a conversation', async () => {
    const { result } = renderHook(() => useBackend());

    act(() => {
      result.current.connectToConversation('conv-1');
    });

    await waitFor(() => {
      expect(result.current.wsConnected).toBe(true);
    });
  });

  it('should send messages via WebSocket', async () => {
    const { result } = renderHook(() => useBackend());
    
    // Connect first
    act(() => {
      result.current.connectToConversation('conv-1');
    });
    
    // Wait for connection
    const ws = result.current.ws as MockWebSocket;
    act(() => {
      ws.connect();
    });

    // Send a message
    act(() => {
      result.current.sendMessage('user-1', 'Hello!');
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'message',
        authorId: 'user-1',
        content: 'Hello!'
      })
    );
  });

  it('should handle incoming messages', async () => {
    const { result } = renderHook(() => useBackend());
    
    // Connect
    act(() => {
      result.current.connectToConversation('conv-1');
    });
    
    const ws = result.current.ws as MockWebSocket;
    act(() => {
      ws.connect();
    });

    // Simulate receiving a message
    act(() => {
      ws.receiveMessage({
        type: 'message',
        message: {
          id: 'msg-1',
          content: 'Received message',
          authorId: 'user-2'
        }
      });
    });

    await waitFor(() => {
      expect(result.current.messages).toContainEqual(
        expect.objectContaining({
          content: 'Received message'
        })
      );
    });
  });

  it('should track editing sessions', async () => {
    const { result } = renderHook(() => useBackend());
    
    // Connect
    act(() => {
      result.current.connectToConversation('conv-1');
    });
    
    const ws = result.current.ws as MockWebSocket;
    act(() => {
      ws.connect();
    });

    // Start editing
    act(() => {
      result.current.startEditing('msg-1', 'user-1');
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'start_editing',
        messageId: 'msg-1',
        userId: 'user-1'
      })
    );

    // Simulate receiving editing notification
    act(() => {
      ws.receiveMessage({
        type: 'editing_started',
        messageId: 'msg-1',
        userId: 'user-2'
      });
    });

    await waitFor(() => {
      expect(result.current.editingSessions).toContainEqual(
        expect.objectContaining({
          messageId: 'msg-1',
          userId: 'user-2'
        })
      );
    });
  });
});