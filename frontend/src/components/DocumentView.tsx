import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface Message {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  leaf_id?: string;
}

interface Leaf {
  id: string;
  name: string;
  conversation_id: string;
  branch_point_message_id?: string;
}

interface DocumentViewProps {
  messages: Message[];
  activeLeaf: Leaf | null;
  conversationId: string;
  currentUserId: string;
  onBranchCreated?: (branchName: string) => void;
}

interface MessageDocBlockProps {
  message: Message;
  roomName: string;
  currentUserId: string;
  isLatestMessage: boolean;
  onBranchCreated: ((branchName: string) => void) | undefined;
}

const MessageDocBlock: React.FC<MessageDocBlockProps> = ({
  message,
  roomName,
  currentUserId: _currentUserId,
  isLatestMessage,
  onBranchCreated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(message.content);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const startEditing = () => {
    setIsEditing(true);
    setIsSyncing(true);

    // Clean up any existing connection
    if (ydocRef.current) {
      ydocRef.current.destroy();
    }
    if (providerRef.current) {
      providerRef.current.destroy();
    }

    // Connect to the same Yjs room as chat view
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText('content');
    ytextRef.current = ytext;

    // Connect to the same WebSocket room that chat view uses
    const provider = new WebsocketProvider(
      'ws://localhost:8000/ws/collaborative',
      roomName,
      ydoc
    );
    providerRef.current = provider;

    provider.on('status', ({ status }: { status: string }) => {
      console.log(`Yjs connection status for ${roomName}:`, status);
    });

    // Wait for initial sync
    provider.on('sync' as any, (synced: boolean) => {
      if (synced) {
        setIsSyncing(false);
        
        // If document is empty, initialize with current content
        if (ytext.length === 0) {
          ytext.insert(0, message.content);
        } else {
          // Sync from Yjs document
          setEditingText(ytext.toString());
        }
      }
    });

    // Listen for changes from other users
    ytext.observe(() => {
      const newText = ytext.toString();
      setEditingText(newText);
    });
  };

  const handleTextChange = (text: string) => {
    setEditingText(text);
    
    if (ytextRef.current && ydocRef.current) {
      ydocRef.current.transact(() => {
        // Clear and insert new text
        ytextRef.current!.delete(0, ytextRef.current!.length);
        ytextRef.current!.insert(0, text);
      });
    }
  };

  const stopEditing = () => {
    // Clean up Yjs connection
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }
    ytextRef.current = null;
    
    setIsEditing(false);
    
    // Show branch notification if editing a non-latest message
    if (!isLatestMessage && onBranchCreated) {
      onBranchCreated(`edit-${Date.now()}`);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
      }
    };
  }, []);

  return (
    <View style={styles.messageBlock}>
      <View style={styles.messageHeader}>
        <Text style={styles.messageHeaderText}>
          ═══ {message.author_id} • {formatDate(message.created_at)} ═══
        </Text>
      </View>
      
      {isEditing ? (
        <View style={styles.editingContainer}>
          {isSyncing ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <>
              <TextInput
                style={styles.editingInput}
                value={editingText}
                onChangeText={handleTextChange}
                multiline
                autoFocus
              />
              <View style={styles.editingActions}>
                <TouchableOpacity
                  style={styles.doneButton}
                  onPress={stopEditing}
                >
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
                {!isLatestMessage && (
                  <Text style={styles.branchWarning}>
                    ⚠️ Editing will create a new branch
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      ) : (
        <TouchableOpacity onPress={startEditing}>
          <Text style={styles.messageContent}>{message.content}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const DocumentView: React.FC<DocumentViewProps> = ({
  messages,
  activeLeaf,
  conversationId: _conversationId,
  currentUserId,
  onBranchCreated,
}) => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.documentContainer}>
        {messages.map((message, index) => (
          <MessageDocBlock
            key={message.id}
            message={message}
            roomName={activeLeaf ? `${activeLeaf.id}-${message.id}` : message.id}
            currentUserId={currentUserId}
            isLatestMessage={index === messages.length - 1}
            onBranchCreated={onBranchCreated}
          />
        ))}
        
        {messages.length === 0 && (
          <Text style={styles.emptyText}>
            No messages yet. Start a conversation in chat view.
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  documentContainer: {
    padding: 20,
  },
  messageBlock: {
    marginBottom: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageHeader: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  messageHeaderText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  messageContent: {
    padding: 15,
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  editingContainer: {
    padding: 15,
  },
  editingInput: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 4,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  editingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  doneButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
  },
  doneButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  branchWarning: {
    fontSize: 12,
    color: '#ff9800',
    fontStyle: 'italic',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 50,
    fontSize: 16,
  },
});

export default DocumentView;