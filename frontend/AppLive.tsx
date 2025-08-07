import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, Button, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import WikiText from './src/components/WikiText';

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

export default function App({ navigation }: { navigation?: any }) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversation, setCurrentConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [editingSessions, setEditingSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('user-1');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [liveTextUpdates, setLiveTextUpdates] = useState<{[messageId: string]: string}>({});
  const [cursorPositions, setCursorPositions] = useState<{[key: string]: {userId: string, position: number}[]}>({});
  const wsRef = useRef<WebSocket | null>(null);
  const textDeltaTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReceivingUpdateRef = useRef(false);
  const editingMessageIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    editingMessageIdRef.current = editingMessageId;
  }, [editingMessageId]);

  // Load conversations on mount
  useEffect(() => {
    fetch(`${API_URL}/v1/conversations`)
      .then(res => res.json())
      .then(data => {
        const convs = data.data || [];
        setConversations(convs);
        if (convs.length > 0) {
          selectConversation(convs[0]);
        } else {
          createNewConversation();
        }
      })
      .catch(err => {
        console.error('Failed to load conversations:', err);
        setLoading(false);
      });
  }, []);

  const createNewConversation = async () => {
    try {
      const response = await fetch(`${API_URL}/v1/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `conv-${Date.now()}`,
          type: 'chat',
          title: 'Live Chat',
          participants: [
            { id: 'user-1', type: 'human', name: 'You' },
            { id: 'ai-1', type: 'ai', name: 'Assistant' }
          ],
          messages: [],
          created_at: new Date().toISOString()  // Backend uses snake_case
        })
      });
      const conv = await response.json();
      setConversations([conv]);
      selectConversation(conv);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setLoading(false);
    }
  };

  const selectConversation = async (conv: any) => {
    setCurrentConversation(conv);
    
    // Load messages
    try {
      const response = await fetch(`${API_URL}/v1/conversations/${conv.id}`);
      const data = await response.json();
      setMessages(data.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }

    // Connect WebSocket
    connectWebSocket(conv.id);
    setLoading(false);
  };

  const connectWebSocket = (conversationId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log(`Attempting WebSocket connection to: ${WS_URL}/v1/conversations/${conversationId}/ws`);
    const ws = new WebSocket(`${WS_URL}/v1/conversations/${conversationId}/ws`);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected successfully!');
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('📨 WebSocket message:', data);
      
      if (data.type === 'connection') {
        // Connection confirmed
      } else if (data.type === 'message') {
        setMessages(prev => {
          // Check if message already exists (update case)
          const existingIndex = prev.findIndex(msg => msg.id === data.message.id);
          if (existingIndex >= 0) {
            // Update existing message
            const updated = [...prev];
            updated[existingIndex] = data.message;
            return updated;
          } else {
            // Add new message
            return [...prev, data.message];
          }
        });
      } else if (data.type === 'editing_started') {
        setEditingSessions(prev => [...prev, {
          messageId: data.messageId,
          userId: data.userId,
          userName: `User ${data.userId}`
        }]);
      } else if (data.type === 'editing_stopped') {
        setEditingSessions(prev => 
          prev.filter(s => !(s.messageId === data.messageId && s.userId === data.userId))
        );
      } else if (data.type === 'text_delta') {
        // Real-time collaborative text synchronization
        console.log('📝 Received text delta:', data);
        console.log('📝 Current state:', { 
          editingMessageId, 
          editingMessageIdRef: editingMessageIdRef.current,
          incomingMessageId: data.messageId, 
          messageIdMatch: editingMessageIdRef.current === data.messageId,
          isMyMessage: data.userId === currentUserId 
        });
        // If we're currently editing this message, update our text field in real-time
        if (editingMessageIdRef.current === data.messageId) {
          console.log('✅ APPLYING text delta - updating from', editingText, 'to', data.text);
          isReceivingUpdateRef.current = true;
          setEditingText(data.text);
          setTimeout(() => {
            isReceivingUpdateRef.current = false;
          }, 50); // Brief delay to prevent echo
        } else {
          console.log('❌ NOT applying - different message or not editing');
        }
        // Also store for other potential uses
        setLiveTextUpdates(prev => ({
          ...prev,
          [data.messageId]: data.text
        }));
      } else if (data.type === 'cursor_move') {
        // Real-time cursor position updates from other users
        console.log('👆 Received cursor move:', data);
        setCursorPositions(prev => ({
          ...prev,
          [data.messageId]: [
            ...(prev[data.messageId] || []).filter(cursor => cursor.userId !== data.userId),
            { userId: data.userId, position: data.cursorPosition }
          ]
        }));
      } else if (data.type === 'presence') {
        console.log(`Active users: ${data.activeUsers}`);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setWsConnected(false);
    };

    ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected. Code:', event.code, 'Reason:', event.reason);
      setWsConnected(false);
    };

    wsRef.current = ws;
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !currentConversation) return;

    try {
      const response = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_id: currentUserId,
          content: inputText
        })
      });
      
      if (response.ok) {
        const message = await response.json();
        setInputText('');
        // Message will be added via WebSocket broadcast
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const startEditing = (messageId: string) => {
    console.log('🎬 Starting editing:', { messageId, userId: currentUserId });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'start_editing',
        messageId,
        userId: currentUserId
      }));
    }
  };

  const stopEditing = (messageId: string) => {
    console.log('🛑 Stopping editing:', { messageId, userId: currentUserId });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_editing',
        messageId,
        userId: currentUserId
      }));
    }
  };

  // Send text_delta messages with debouncing
  const sendTextDelta = (messageId: string, text: string, cursorPosition: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Clear existing timeout
    if (textDeltaTimeoutRef.current) {
      clearTimeout(textDeltaTimeoutRef.current);
    }

    // Debounce text updates to avoid spam
    textDeltaTimeoutRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'text_delta',
          messageId,
          userId: currentUserId,
          text,
          cursorPosition
        }));
      }
    }, 150); // 150ms debounce
  };

  // Send cursor position updates
  const sendCursorMove = (messageId: string, cursorPosition: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor_move',
        messageId,
        userId: currentUserId,
        cursorPosition
      }));
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Connecting to backend...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {currentConversation?.title || 'Chat'} 
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.userPicker}>
            <Text style={styles.userLabel}>You: </Text>
            <TextInput
              style={styles.userInput}
              value={currentUserId}
              onChangeText={setCurrentUserId}
              placeholder="user-1"
            />
          </View>
          <Text style={[styles.status, wsConnected ? styles.connected : styles.disconnected]}>
            {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
        </View>
      </View>
      
      {editingSessions.length > 0 && (
        <View style={styles.editingBar}>
          <Text style={styles.editingText}>
            {editingSessions.map(s => s.userName).join(', ')} editing...
          </Text>
        </View>
      )}

      <ScrollView style={styles.messages}>
        {messages.map((msg: any, index: number) => {
          const isOwn = msg.author_id === currentUserId;
          const showAuthor = index === 0 || messages[index - 1].author_id !== msg.author_id;
          
          return (
            <View key={msg.id} style={[
              styles.messageGroup,
              isOwn ? styles.ownMessageGroup : styles.otherMessageGroup
            ]}>
              {!isOwn && showAuthor && (
                <Text style={styles.authorLabel}>
                  {msg.author_id === 'ai-1' ? 'Assistant' : 'User'}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  styles.message,
                  isOwn ? styles.ownMessage : styles.otherMessage
                ]}
                onLongPress={() => {
                  // Allow editing any message for collaborative testing
                  console.log('👆 Long press - starting edit for message:', msg.id);
                  setEditingMessageId(msg.id);
                  setEditingText(msg.content);
                  console.log('📝 Set editingMessageId to:', msg.id);
                  startEditing(msg.id);
                }}
              >
                <WikiText 
                  text={msg.content}
                  textStyle={[
                    styles.messageText, 
                    isOwn ? styles.ownMessageText : styles.otherMessageText
                  ]}
                  wikiTagStyle={{
                    color: isOwn ? '#4A90E2' : '#007AFF',
                    textDecorationLine: 'underline',
                    fontWeight: '600'
                  }}
                  onWikiTagPress={(concept) => {
                    console.log('🔗 Wiki tag clicked:', concept);
                    if (navigation) {
                      navigation.navigate('WikiPage', { concept });
                    }
                  }}
                />
                {editingSessions.some(s => s.messageId === msg.id) && (
                  <Text style={styles.editIndicator}>✏️ Being edited</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>

      {editingMessageId && (
        <View style={styles.editingOverlay}>
          <View style={styles.editingModal}>
            <Text style={styles.editingTitle}>Edit Message (Collaborative)</Text>
            
            {/* Show who else is editing this message */}
            {editingMessageId && editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).length > 0 && (
              <View style={styles.collaboratorsContainer}>
                <Text style={styles.collaboratorsLabel}>
                  👥 Also editing: {editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).map(s => s.userId).join(', ')}
                </Text>
              </View>
            )}
            
            {/* Show cursor positions from other users within the same editing context */}
            {editingMessageId && cursorPositions[editingMessageId] && cursorPositions[editingMessageId].length > 0 && (
              <View style={styles.cursorContainer}>
                {cursorPositions[editingMessageId].map((cursor, index) => (
                  <Text key={index} style={styles.cursorIndicator}>
                    👆 {cursor.userId} editing at position {cursor.position}
                  </Text>
                ))}
              </View>
            )}
            
            <TextInput
              style={styles.editingInput}
              value={editingText}
              onChangeText={(text) => {
                console.log('✏️ Text changed:', { text, editingMessageId, isReceiving: isReceivingUpdateRef.current });
                setEditingText(text);
                // Send real-time text delta to other users (but not if we're receiving an update)
                if (editingMessageId && !isReceivingUpdateRef.current) {
                  console.log('📤 Sending text_delta:', { messageId: editingMessageId, text });
                  sendTextDelta(editingMessageId, text, text.length); // Cursor at end for simplicity
                } else {
                  console.log('🚫 Skipping text_delta send:', { editingMessageId: !!editingMessageId, isReceiving: isReceivingUpdateRef.current });
                }
              }}
              onSelectionChange={(event) => {
                // Send cursor position updates
                if (editingMessageId && event.nativeEvent.selection) {
                  const cursorPosition = event.nativeEvent.selection.start;
                  sendCursorMove(editingMessageId, cursorPosition);
                }
              }}
              multiline
              autoFocus
            />
            <View style={styles.editingButtons}>
              <TouchableOpacity 
                style={[styles.editingButton, styles.cancelButton]} 
                onPress={() => {
                  console.log('❌ Cancel button pressed - clearing editingMessageId');
                  stopEditing(editingMessageId);
                  setEditingMessageId(null);
                  setEditingText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.editingButton, styles.saveButton]} 
                onPress={async () => {
                  if (editingMessageId && currentConversation) {
                    try {
                      // Update message via REST API
                      const response = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages/${editingMessageId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          content: editingText
                        })
                      });
                      
                      if (response.ok) {
                        // Message update will be received via WebSocket broadcast
                        console.log('💾 Save successful - clearing editingMessageId');
                        stopEditing(editingMessageId);
                        setEditingMessageId(null);
                        setEditingText('');
                      } else {
                        console.error('Failed to update message');
                      }
                    } catch (error) {
                      console.error('Error updating message:', error);
                    }
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  userPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userLabel: {
    fontSize: 12,
    color: '#666',
  },
  userInput: {
    fontSize: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 4,
    minWidth: 60,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  status: {
    fontSize: 12,
  },
  connected: {
    color: 'green',
  },
  disconnected: {
    color: 'red',
  },
  editingBar: {
    backgroundColor: '#fffacd',
    padding: 5,
  },
  editingText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  messages: {
    flex: 1,
    padding: 10,
  },
  messageGroup: {
    marginVertical: 2,
  },
  ownMessageGroup: {
    alignItems: 'flex-end',
  },
  otherMessageGroup: {
    alignItems: 'flex-start',
  },
  authorLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    marginLeft: 12,
    fontWeight: '500',
  },
  message: {
    padding: 12,
    marginVertical: 1,
    borderRadius: 18,
    maxWidth: '75%',
    minWidth: '20%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  ownMessage: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 6,
  },
  otherMessage: {
    backgroundColor: '#F1F1F1',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    color: '#000',
  },
  ownMessageText: {
    color: 'white',
  },
  otherMessageText: {
    color: '#000',
  },
  editIndicator: {
    fontSize: 10,
    marginTop: 5,
    opacity: 0.7,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  editingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editingModal: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    margin: 20,
    width: '80%',
    maxWidth: 400,
  },
  editingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  editingInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  editingButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  editingButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  collaboratorsContainer: {
    backgroundColor: '#e8f5e8',
    padding: 8,
    borderRadius: 4,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  collaboratorsLabel: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '500',
  },
  cursorContainer: {
    backgroundColor: '#fff8e1',
    padding: 8,
    borderRadius: 4,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ff9800',
  },
  cursorIndicator: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
});