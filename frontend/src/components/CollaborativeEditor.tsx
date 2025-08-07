import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  Platform,
} from 'react-native';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface Cursor {
  userId: string;
  userName: string;
  position: number;
  color: string;
  selection?: {
    start: number;
    end: number;
  };
}

interface CollaborativeEditorProps {
  documentId: string;
  userId: string;
  userName: string;
  initialContent?: string;
  onContentChange?: (content: string) => void;
}

const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  documentId,
  userId,
  userName,
  initialContent = '',
  onContentChange,
}) => {
  const [text, setText] = useState('');
  const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const userColorRef = useRef<string>(
    CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)] || '#FF6B6B'
  );

  // Initialize Yjs document and WebSocket provider
  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(
      'ws://localhost:8000/ws/collaborative',
      documentId,
      ydoc
    );
    const ytext = ydoc.getText('content');

    ydocRef.current = ydoc;
    providerRef.current = provider;
    ytextRef.current = ytext;

    // Connection status
    provider.on('status', ({ status }: { status: string }) => {
      setIsConnected(status === 'connected');
    });

    // Listen for text changes from other users
    ytext.observe(() => {
      const newText = ytext.toString();
      setText(newText);
      onContentChange?.(newText);
    });

    // Wait for initial sync, then set content if empty
    provider.on('synced', (synced: boolean) => {
      if (synced && ytext.length === 0 && initialContent) {
        ytext.insert(0, initialContent);
      }
      setText(ytext.toString());
    });

    // Awareness for cursors
    const awareness = provider.awareness;
    awareness.setLocalStateField('user', {
      name: userName,
      color: userColorRef.current,
    });

    awareness.on('change', () => {
      const states = awareness.getStates();
      const newCursors = new Map<string, Cursor>();

      states.forEach((state, clientId) => {
        if (clientId !== awareness.clientID && state.user) {
          const cursorInfo = state.cursor;
          if (cursorInfo) {
            newCursors.set(clientId.toString(), {
              userId: clientId.toString(),
              userName: state.user.name,
              position: cursorInfo.position,
              color: state.user.color,
              selection: cursorInfo.selection,
            });
          }
        }
      });

      setCursors(newCursors);
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [documentId, userName, initialContent, onContentChange]);

  // Update cursor position when selection changes
  const updateCursor = useCallback((position: number, selection?: { start: number; end: number }) => {
    if (providerRef.current?.awareness) {
      providerRef.current.awareness.setLocalStateField('cursor', {
        position,
        selection,
      });
    }
  }, []);

  // Handle text input changes
  const handleTextChange = useCallback((newText: string) => {
    if (!ytextRef.current || !ydocRef.current) return;

    const ytext = ytextRef.current;
    const currentText = ytext.toString();

    // Find the differences and apply them to Yjs
    if (newText !== currentText) {
      ydocRef.current.transact(() => {
        // Simple diff - in production you'd want a more sophisticated diff algorithm
        if (newText.length > currentText.length) {
          // Text was inserted
          const insertPos = findInsertPosition(currentText, newText);
          const insertedText = newText.slice(insertPos, insertPos + (newText.length - currentText.length));
          ytext.insert(insertPos, insertedText);
        } else if (newText.length < currentText.length) {
          // Text was deleted
          const deletePos = findDeletePosition(currentText, newText);
          const deleteLength = currentText.length - newText.length;
          ytext.delete(deletePos, deleteLength);
        } else {
          // Text was replaced
          ytext.delete(0, currentText.length);
          ytext.insert(0, newText);
        }
      });
    }

    setText(newText);
  }, []);

  // Handle selection change
  const handleSelectionChange = useCallback((event: any) => {
    const { selection } = event.nativeEvent;
    if (selection) {
      updateCursor(selection.start, {
        start: selection.start,
        end: selection.end,
      });
    }
  }, [updateCursor]);

  // Render cursor indicators
  const renderCursors = () => {
    return Array.from(cursors.values()).map((cursor) => (
      <View
        key={cursor.userId}
        style={[
          styles.cursor,
          {
            backgroundColor: cursor.color,
            // Position would need to be calculated based on text layout
            // This is simplified for React Native
          },
        ]}
      >
        <Text style={[styles.cursorLabel, { color: cursor.color }]}>
          {cursor.userName}
        </Text>
      </View>
    ));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Collaborative Editor</Text>
        <View style={[
          styles.connectionStatus,
          { 
            backgroundColor: isConnected ? '#5F9B65' : '#D83C3E',
            borderColor: isConnected ? '#4A7A4F' : '#B82C2E'
          }
        ]}>
          <Text style={styles.connectionText}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>

      <View style={styles.presenceContainer}>
        {Array.from(cursors.values()).map((cursor) => (
          <View key={cursor.userId} style={styles.presenceIndicator}>
            <View
              style={[
                styles.presenceCircle,
                { backgroundColor: cursor.color }
              ]}
            />
            <Text style={styles.presenceName}>{cursor.userName}</Text>
          </View>
        ))}
      </View>

      <View style={styles.editorContainer}>
        <TextInput
          ref={textInputRef}
          style={styles.textInput}
          value={text}
          onChangeText={handleTextChange}
          onSelectionChange={handleSelectionChange}
          multiline
          placeholder="Start typing to collaborate..."
          placeholderTextColor="#999"
          scrollEnabled
          textAlignVertical="top"
        />
        {renderCursors()}
      </View>
    </View>
  );
};

// Helper functions for text diffing
function findInsertPosition(oldText: string, newText: string): number {
  let i = 0;
  while (i < Math.min(oldText.length, newText.length) && oldText[i] === newText[i]) {
    i++;
  }
  return i;
}

function findDeletePosition(oldText: string, newText: string): number {
  let i = 0;
  while (i < Math.min(oldText.length, newText.length) && oldText[i] === newText[i]) {
    i++;
  }
  return i;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1C',
    letterSpacing: -0.5,
  },
  connectionStatus: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  connectionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  presenceContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FAFAFA',
    flexWrap: 'wrap',
  },
  presenceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  presenceCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  presenceName: {
    fontSize: 13,
    color: '#5F5F5F',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    flex: 1,
    padding: 24,
    fontSize: 18,
    lineHeight: 28,
    color: '#1C1C1C',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',  // LessWrong uses serif for content
    letterSpacing: 0.3,
  },
  cursor: {
    position: 'absolute',
    width: 2,
    height: 24,
    zIndex: 1000,
  },
  cursorLabel: {
    position: 'absolute',
    top: -22,
    left: 0,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
});

export default CollaborativeEditor;