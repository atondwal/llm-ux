import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import ChatView from '../../../ChatView';
import fetchMock from 'jest-fetch-mock';

// Enable fetch mocks
fetchMock.enableMocks();

// Mock WebSocket
class MockWebSocket {
  onopen: any;
  onmessage: any;
  onclose: any;
  onerror: any;
  
  constructor(public url: string) {
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  send(data: any) {}
  close() {
    if (this.onclose) this.onclose();
  }
}

global.WebSocket = MockWebSocket as any;

// Mock WebsocketProvider from y-websocket
jest.mock('y-websocket', () => ({
  WebsocketProvider: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    destroy: jest.fn(),
    awareness: {
      setLocalStateField: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    }
  }))
}));

describe('Sidebar Functionality', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    jest.clearAllMocks();
  });

  describe('Sidebar Display', () => {
    it('should display sidebar with conversation list', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Test Chat 1',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'wiki',
          title: 'Test Wiki',
          participants: [],
          messages: []
        }
      ];

      fetchMock.mockResponses(
        // Initial conversations fetch
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        // Leaves fetch for first conversation
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        // Messages fetch for first conversation
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        expect(getByText('Test Chat 1')).toBeTruthy();
        expect(getByText('Test Wiki')).toBeTruthy();
      });
    });

    it('should show correct icons for chat and wiki conversations', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Chat Conversation',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'wiki',
          title: 'Wiki Conversation',
          participants: [],
          messages: []
        }
      ];

      fetchMock.mockResponses(
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        // Chat icon
        expect(getByText('💬')).toBeTruthy();
        // Wiki icon
        expect(getByText('📚')).toBeTruthy();
      });
    });

    it('should highlight active conversation', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Active Chat',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'chat',
          title: 'Inactive Chat',
          participants: [],
          messages: []
        }
      ];

      fetchMock.mockResponses(
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        const activeConv = getByText('Active Chat').parent;
        const inactiveConv = getByText('Inactive Chat').parent;
        
        // Check that active conversation has different styling
        expect(activeConv?.props.style).toContainEqual(
          expect.objectContaining({ backgroundColor: '#e3f2fd' })
        );
        expect(inactiveConv?.props.style).not.toContainEqual(
          expect.objectContaining({ backgroundColor: '#e3f2fd' })
        );
      });
    });
  });

  describe('Sidebar Toggle', () => {
    it('should toggle sidebar visibility when hamburger menu is clicked', async () => {
      fetchMock.mockResponses(
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText, queryByText } = render(<ChatView />);

      await waitFor(() => {
        expect(getByText('☰')).toBeTruthy();
      });

      const hamburger = getByText('☰');
      
      // Initially sidebar should be visible
      expect(getByText('+ New Chat')).toBeTruthy();

      // Click to hide
      fireEvent.press(hamburger);
      
      // After hiding, sidebar content should not be visible
      // Note: The sidebar container still exists but with width: 0
      await waitFor(() => {
        const sidebar = getByText('+ New Chat').parent?.parent;
        expect(sidebar?.props.style).toContainEqual(
          expect.objectContaining({ width: 0 })
        );
      });

      // Click to show again
      fireEvent.press(hamburger);
      
      await waitFor(() => {
        const sidebar = getByText('+ New Chat').parent?.parent;
        expect(sidebar?.props.style).toContainEqual(
          expect.objectContaining({ width: 250 })
        );
      });
    });
  });

  describe('Conversation Switching', () => {
    it('should switch conversations when clicking on a different one', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'First Chat',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'chat',
          title: 'Second Chat',
          participants: [],
          messages: []
        }
      ];

      const conv1Messages = [
        { id: 'msg-1', content: 'Message in first chat', author_id: 'user-1' }
      ];

      const conv2Messages = [
        { id: 'msg-2', content: 'Message in second chat', author_id: 'user-1' }
      ];

      fetchMock.mockResponses(
        // Initial load
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: conv1Messages }), { status: 200 }],
        // Switch to second conversation
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: conv2Messages }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      // Wait for initial load
      await waitFor(() => {
        expect(getByText('First Chat')).toBeTruthy();
        expect(getByText('Message in first chat')).toBeTruthy();
      });

      // Click on second conversation
      fireEvent.press(getByText('Second Chat'));

      // Should load second conversation's messages
      await waitFor(() => {
        expect(getByText('Message in second chat')).toBeTruthy();
      });

      // First chat's messages should no longer be visible
      expect(() => getByText('Message in first chat')).toThrow();
    });

    it('should close existing WebSocket when switching conversations', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'First Chat',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'chat',
          title: 'Second Chat',
          participants: [],
          messages: []
        }
      ];

      let closeCalled = false;
      MockWebSocket.prototype.close = jest.fn(() => {
        closeCalled = true;
      });

      fetchMock.mockResponses(
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        expect(getByText('Second Chat')).toBeTruthy();
      });

      // Switch conversation
      fireEvent.press(getByText('Second Chat'));

      await waitFor(() => {
        expect(closeCalled).toBe(true);
      });
    });
  });

  describe('New Conversation Creation', () => {
    it('should create new conversation when + New Chat button is clicked', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Existing Chat',
          participants: [],
          messages: []
        }
      ];

      const newConversation = {
        id: 'conv-new',
        type: 'chat',
        title: 'Chat 2',
        participants: [
          { id: 'user-1', type: 'human', name: 'You' },
          { id: 'ai-1', type: 'ai', name: 'Assistant' }
        ],
        messages: []
      };

      fetchMock.mockResponses(
        // Initial load
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }],
        // Create new conversation
        [JSON.stringify(newConversation), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        expect(getByText('+ New Chat')).toBeTruthy();
      });

      // Click new chat button
      fireEvent.press(getByText('+ New Chat'));

      // Should create and display new conversation
      await waitFor(() => {
        expect(getByText('Chat 2')).toBeTruthy();
      });

      // Verify POST request was made
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/v1/conversations',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"type":"chat"')
        })
      );
    });

    it('should increment chat number for new conversations', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Chat 1',
          participants: [],
          messages: []
        },
        {
          id: 'conv-2',
          type: 'wiki',
          title: 'Wiki Page',
          participants: [],
          messages: []
        }
      ];

      fetchMock.mockResponses(
        [JSON.stringify({ data: mockConversations }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }],
        [JSON.stringify({ id: 'new', title: 'Chat 2' }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      const { getByText } = render(<ChatView />);

      await waitFor(() => {
        expect(getByText('+ New Chat')).toBeTruthy();
      });

      fireEvent.press(getByText('+ New Chat'));

      // Check that the title is "Chat 2" (only 1 existing chat, so next is 2)
      await waitFor(() => {
        const calls = fetchMock.mock.calls;
        const createCall = calls.find(call => call[1]?.method === 'POST');
        const body = JSON.parse(createCall?.[1]?.body as string);
        expect(body.title).toBe('Chat 2');
      });
    });
  });

  describe('Empty State', () => {
    it('should create new conversation when no conversations exist', async () => {
      fetchMock.mockResponses(
        // Initial load - no conversations
        [JSON.stringify({ data: [] }), { status: 200 }],
        // Auto-create new conversation
        [JSON.stringify({ 
          id: 'auto-created',
          type: 'chat',
          title: 'Chat 1',
          participants: [],
          messages: []
        }), { status: 200 }],
        [JSON.stringify({ leaves: [], active_leaf_id: null }), { status: 200 }],
        [JSON.stringify({ data: [] }), { status: 200 }]
      );

      render(<ChatView />);

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:8000/v1/conversations',
          expect.objectContaining({
            method: 'POST'
          })
        );
      });
    });
  });
});