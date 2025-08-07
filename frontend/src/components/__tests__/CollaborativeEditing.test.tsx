import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AppLive from '../../../AppLive';

// Mock fetch
global.fetch = jest.fn();

// Mock WebSocket
class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readyState: number = WebSocket.CONNECTING;
  private listeners: { [key: string]: ((event: any) => void)[] } = {};

  constructor(public url: string) {
    // Track this instance globally for tests
    (global as any).__lastWebSocketInstance = this;
    
    // Simulate connection opening after a short delay
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    // Mock send - we'll track sent messages for testing
    const message = JSON.parse(data);
    if (global.__mockWebSocketSentMessages) {
      global.__mockWebSocketSentMessages.push(message);
    }
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Helper method to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
}

// Mock WebSocket globally
global.WebSocket = MockWebSocket as any;
global.__mockWebSocketSentMessages = [];

// Mock console methods to avoid noise in tests
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Collaborative Editing', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    global.__mockWebSocketSentMessages = [];

    // Mock conversation fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'conv-1', title: 'Test Chat', messages: [] }] })
    } as Response);

    // Mock messages fetch
    mockFetch.mockResolvedValueOnce({
      ok: true, 
      json: async () => ({
        data: [
          { id: 'msg-1', author_id: 'user-1', content: 'Hello world', created_at: '2024-01-01T00:00:00Z' }
        ]
      })
    } as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockClear();
  });

  it('should maintain editingMessageId when starting collaborative editing', async () => {
    const { getByText, getByDisplayValue, queryByText } = render(<AppLive />);

    // Wait for component to load past loading state
    await waitFor(() => {
      expect(queryByText('Connecting to backend...')).toBeNull();
    });

    // Wait for WebSocket connection
    await waitFor(() => {
      expect(global.__mockWebSocketSentMessages).toEqual([]);
    }, { timeout: 100 });

    // Long press to start editing
    const message = getByText('Hello world');
    fireEvent(message, 'onLongPress');

    // Check that editing modal appears
    await waitFor(() => {
      expect(getByDisplayValue('Hello world')).toBeTruthy();
    });

    // Verify start_editing was sent via WebSocket
    await waitFor(() => {
      const sentMessages = global.__mockWebSocketSentMessages;
      expect(sentMessages).toContainEqual({
        type: 'start_editing',
        messageId: 'msg-1',
        userId: 'user-1'
      });
    });

    // Now simulate receiving a text_delta for the SAME message
    const wsInstance = (global as any).__lastWebSocketInstance;
    if (wsInstance) {
      act(() => {
        wsInstance.simulateMessage({
          type: 'text_delta',
          messageId: 'msg-1', // Same message ID
          userId: 'user-2',   // Different user
          text: 'Hello collaborative world',
          cursorPosition: 26
        });
      });

      // The text input should update with the collaborative change
      await waitFor(() => {
        expect(getByDisplayValue('Hello collaborative world')).toBeTruthy();
      });
    }
  });

  it('should ignore text_delta for different messages', async () => {
    const { getByText, getByDisplayValue } = render(<AppLive />);

    // Wait for component to load
    await waitFor(() => {
      expect(getByText('Hello world')).toBeTruthy();
    });

    // Long press to start editing
    const message = getByText('Hello world');
    fireEvent(message, 'onLongPress');

    // Check that editing modal appears
    await waitFor(() => {
      expect(getByDisplayValue('Hello world')).toBeTruthy();
    });

    // Now simulate receiving a text_delta for a DIFFERENT message
    const wsInstance = (global as any).__lastWebSocketInstance;
    if (wsInstance) {
      act(() => {
        wsInstance.simulateMessage({
          type: 'text_delta',
          messageId: 'msg-2', // Different message ID
          userId: 'user-2',
          text: 'Different message text',
          cursorPosition: 20
        });
      });

      // The text input should NOT update (should still show original text)
      await waitFor(() => {
        expect(getByDisplayValue('Hello world')).toBeTruthy();
      });
    }
  });

  it('should stop applying text_deltas after editing ends', async () => {
    const { getByText, getByDisplayValue } = render(<AppLive />);

    // Wait for component to load and start editing
    await waitFor(() => {
      expect(getByText('Hello world')).toBeTruthy();
    });

    const message = getByText('Hello world');
    fireEvent(message, 'onLongPress');

    await waitFor(() => {
      expect(getByDisplayValue('Hello world')).toBeTruthy();
    });

    // Cancel editing
    const cancelButton = getByText('Cancel');
    fireEvent.press(cancelButton);

    // Now simulate receiving a text_delta after editing has ended
    const wsInstance = (global as any).__lastWebSocketInstance;
    if (wsInstance) {
      act(() => {
        wsInstance.simulateMessage({
          type: 'text_delta',
          messageId: 'msg-1',
          userId: 'user-2',
          text: 'Should not update',
          cursorPosition: 17
        });
      });

      // Since we're no longer editing, this should be ignored
      // The editing modal should be closed, so the input won't be visible
      await waitFor(() => {
        expect(() => getByDisplayValue('Should not update')).toThrow();
      });
    }
  });
});