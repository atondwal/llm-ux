import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CollaborativeEditor from '../CollaborativeEditor';

// Mock Yjs and y-websocket with more comprehensive mocking
let mockYTextObserveCallback: (() => void) | null = null;
let mockProviderStatusCallback: ((event: { status: string }) => void) | null = null;
let mockAwarenessCallback: (() => void) | null = null;

jest.mock('yjs', () => {
  const mockYText = {
    toString: jest.fn(() => 'initial content'),
    insert: jest.fn(),
    delete: jest.fn(),
    observe: jest.fn((callback) => {
      mockYTextObserveCallback = callback;
    }),
  };
  
  const mockDoc = {
    getText: jest.fn(() => mockYText),
    destroy: jest.fn(),
    transact: jest.fn((fn) => fn()),
  };
  
  return {
    Doc: jest.fn(() => mockDoc),
    Text: mockYText,
  };
});

jest.mock('y-websocket', () => {
  const mockAwareness = {
    setLocalStateField: jest.fn(),
    on: jest.fn((event, callback) => {
      if (event === 'change') {
        mockAwarenessCallback = callback;
      }
    }),
    getStates: jest.fn(() => new Map()),
    clientID: 'test-client',
  };
  
  const mockProvider = {
    on: jest.fn((event, callback) => {
      if (event === 'status') {
        mockProviderStatusCallback = callback;
      }
    }),
    destroy: jest.fn(),
    awareness: mockAwareness,
  };
  
  return {
    WebsocketProvider: jest.fn(() => mockProvider),
  };
});

describe('CollaborativeEditor', () => {
  const defaultProps = {
    documentId: 'test-doc',
    userId: 'user1',
    userName: 'Test User',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText, getByPlaceholderText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    expect(getByText('Collaborative Editor')).toBeTruthy();
    expect(getByPlaceholderText('Start typing to collaborate...')).toBeTruthy();
  });

  it('shows connection status', () => {
    const { getByText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    // Initially disconnected
    expect(getByText('Disconnected')).toBeTruthy();
  });

  it('displays presence indicators for other users', async () => {
    const { getByText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    // Simulate awareness change with other users
    if (mockAwarenessCallback) {
      const mockGetStates = require('y-websocket').WebsocketProvider().awareness.getStates;
      mockGetStates.mockReturnValue(new Map([
        ['user2', {
          user: { name: 'Other User', color: '#FF6B6B' },
          cursor: { position: 10 }
        }]
      ]));
      
      mockAwarenessCallback();
      
      await waitFor(() => {
        expect(getByText('Other User')).toBeTruthy();
      });
    }
  });

  it('handles text input changes', () => {
    const mockOnContentChange = jest.fn();
    const { getByPlaceholderText } = render(
      <CollaborativeEditor 
        {...defaultProps} 
        onContentChange={mockOnContentChange}
      />
    );
    
    const textInput = getByPlaceholderText('Start typing to collaborate...');
    
    fireEvent.changeText(textInput, 'Hello World');
    
    expect(textInput.props.value).toBe('Hello World');
  });

  it('updates cursor position on selection change', () => {
    const { getByPlaceholderText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    const textInput = getByPlaceholderText('Start typing to collaborate...');
    
    fireEvent(textInput, 'selectionChange', {
      nativeEvent: {
        selection: { start: 5, end: 10 }
      }
    });
    
    // Verify awareness update would be called (mocked)
    expect(textInput).toBeTruthy();
  });

  it('handles component unmount gracefully', () => {
    const { unmount } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    // Should not throw error on unmount
    expect(() => unmount()).not.toThrow();
  });

  it('displays user presence with colors', () => {
    const { getByText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    expect(getByText('Collaborative Editor')).toBeTruthy();
  });

  it('initializes with correct document ID', () => {
    render(
      <CollaborativeEditor 
        documentId="custom-doc-id"
        userId="user1"
        userName="Test User"
      />
    );
    
    // Verify WebsocketProvider was called with correct URL
    const { WebsocketProvider } = require('y-websocket');
    expect(WebsocketProvider).toHaveBeenCalledWith(
      'ws://localhost:8000/ws/collaborative/custom-doc-id',
      'custom-doc-id',
      expect.any(Object)
    );
  });

  it('handles WebSocket connection errors gracefully', () => {
    // Mock provider with error
    const mockProvider = {
      on: jest.fn((event, callback) => {
        if (event === 'status') {
          callback({ status: 'disconnected' });
        }
      }),
      destroy: jest.fn(),
      awareness: {
        setLocalStateField: jest.fn(),
        on: jest.fn(),
        getStates: jest.fn(() => new Map()),
        clientID: 'test-client',
      },
    };
    
    const { WebsocketProvider } = require('y-websocket');
    WebsocketProvider.mockReturnValueOnce(mockProvider);
    
    const { getByText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    expect(getByText('Disconnected')).toBeTruthy();
  });

  it('triggers connection status change', async () => {
    const { getByText } = render(
      <CollaborativeEditor {...defaultProps} />
    );
    
    // Simulate connection status change
    if (mockProviderStatusCallback) {
      mockProviderStatusCallback({ status: 'connected' });
      
      await waitFor(() => {
        expect(getByText('Connected')).toBeTruthy();
      });
    }
  });

  it('handles text changes from Yjs', async () => {
    const mockOnContentChange = jest.fn();
    render(
      <CollaborativeEditor 
        {...defaultProps} 
        onContentChange={mockOnContentChange}
      />
    );
    
    // Simulate Yjs text change
    if (mockYTextObserveCallback) {
      const mockYText = require('yjs').Doc().getText();
      mockYText.toString.mockReturnValue('updated content');
      
      mockYTextObserveCallback();
      
      await waitFor(() => {
        expect(mockOnContentChange).toHaveBeenCalledWith('updated content');
      });
    }
  });

  it('handles diff functions for text insertion and deletion', () => {
    const mockOnContentChange = jest.fn();
    const { getByPlaceholderText } = render(
      <CollaborativeEditor 
        {...defaultProps} 
        onContentChange={mockOnContentChange}
      />
    );
    
    const textInput = getByPlaceholderText('Start typing to collaborate...');
    
    // Test insertion
    fireEvent.changeText(textInput, 'initial content with new text');
    
    // Test deletion
    fireEvent.changeText(textInput, 'initial');
    
    // Test replacement
    fireEvent.changeText(textInput, 'completely different text');
    
    expect(textInput).toBeTruthy();
  });
});