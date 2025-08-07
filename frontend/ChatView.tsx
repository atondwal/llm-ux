import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import WikiText from './src/components/WikiText';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const API_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';

export default function App({ navigation }: { navigation?: any }) {
  const [currentConversation, setCurrentConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [editingSessions, setEditingSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('user-1');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [aiProactive, setAiProactive] = useState(false);
  
  // Branching state
  const [leaves, setLeaves] = useState<any[]>([]);
  const [activeLeaf, setActiveLeaf] = useState<any>(null);
  const [messageVersions, setMessageVersions] = useState<{[key: string]: any[]}>({});
  
  const wsRef = useRef<WebSocket | null>(null);
  
  // Yjs document and provider refs for collaborative editing
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
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
          created_at: new Date().toISOString()
        })
      });
      const conv = await response.json();
      selectConversation(conv);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setLoading(false);
    }
  };

  const selectConversation = async (conv: any) => {
    setCurrentConversation(conv);
    
    // Load leaves first
    try {
      const leavesResponse = await fetch(`${API_URL}/v1/conversations/${conv.id}/leaves`);
      const leavesData = await leavesResponse.json();
      setLeaves(leavesData.leaves || []);
      
      // Set active leaf
      const activeLeafId = leavesData.active_leaf_id;
      const activeLeafObj = leavesData.leaves?.find((l: any) => l.id === activeLeafId);
      setActiveLeaf(activeLeafObj || leavesData.leaves?.[0]);
    } catch (error) {
      console.error('Failed to load leaves:', error);
    }
    
    // Load messages
    try {
      const response = await fetch(`${API_URL}/v1/conversations/${conv.id}/messages`);
      const data = await response.json();
      setMessages(data.data || []);
      
      // Load versions for each message
      if (data.data) {
        for (const msg of data.data) {
          loadMessageVersions(msg.id);
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }

    // Connect WebSocket for regular messages
    connectWebSocket(conv.id);
    setLoading(false);
  };

  const connectWebSocket = (conversationId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_URL}/v1/conversations/${conversationId}/ws`);
    
    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connection') {
        // Connection confirmed
      } else if (data.type === 'message') {
        setMessages(prev => {
          const existingIndex = prev.findIndex(msg => msg.id === data.message.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = data.message;
            return updated;
          } else {
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
      } else if (data.type === 'message_updated') {
        // Update message when saved through Yjs collaboration
        setMessages(prev => {
          const index = prev.findIndex(msg => msg.id === data.messageId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = { ...updated[index], content: data.content };
            return updated;
          }
          return prev;
        });
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setWsConnected(false);
    };

    ws.onclose = () => {
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
        await response.json();
        setInputText('');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const startEditing = (messageId: string) => {
    // Notify others via regular WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'start_editing',
        messageId,
        userId: currentUserId
      }));
    }

    // Clean up previous Yjs connection if any
    if (providerRef.current) {
      providerRef.current.destroy();
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
    }

    // Create new Yjs document for this message
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Create collaborative text
    const ytext = ydoc.getText('content');
    yTextRef.current = ytext;

    // Use leaf-specific room name for Yjs
    const roomName = activeLeaf ? `${activeLeaf.id}-${messageId}` : messageId;
    
    // Connect to Yjs WebSocket endpoint for this specific message and leaf
    const provider = new WebsocketProvider(
      `ws://localhost:8000/ws/collaborative`,
      roomName, // Use leaf-specific room name
      ydoc
    );

    provider.on('status', (event: any) => {
      console.log('Yjs connection status:', event.status);
    });

    // Wait for initial sync before setting content
    provider.on('synced', (synced: boolean) => {
      if (synced) {
        // Only set initial content if the document is empty (first editor)
        if (ytext.length === 0) {
          const message = messages.find(m => m.id === messageId);
          if (message) {
            ytext.insert(0, message.content);
          }
        }
        // Set the current text from the synced document
        setEditingText(ytext.toString());
      }
    });

    // Observe text changes from other users
    ytext.observe(() => {
      if (editingMessageIdRef.current === messageId) {
        setEditingText(ytext.toString());
      }
    });

    providerRef.current = provider;
  };

  const stopEditing = (messageId: string) => {
    // Notify others via regular WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_editing',
        messageId,
        userId: currentUserId
      }));
    }

    // Clean up Yjs
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }
    yTextRef.current = null;
  };

  // Load versions for a message
  const loadMessageVersions = async (messageId: string) => {
    if (!currentConversation) return;
    
    try {
      const response = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages/${messageId}/versions`);
      const data = await response.json();
      console.log(`Versions for message ${messageId}:`, data);
      setMessageVersions(prev => ({
        ...prev,
        [messageId]: data.versions || []
      }));
      return data;
    } catch (error) {
      console.error('Failed to load versions:', error);
      return null;
    }
  };

  // Navigate to a different version of a message
  const navigateToVersion = async (messageId: string, versionIndex: number) => {
    if (!currentConversation) return;
    
    try {
      const response = await fetch(
        `${API_URL}/v1/conversations/${currentConversation.id}/messages/${messageId}/version`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version_index: versionIndex })
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        // Update the message content locally
        setMessages(prev => prev.map(msg => 
          msg.id === messageId 
            ? { ...msg, content: data.content }
            : msg
        ));
        
        // Reload leaves to get updated active leaf
        const leavesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/leaves`);
        const leavesData = await leavesResponse.json();
        setLeaves(leavesData.leaves || []);
        
        const activeLeafId = leavesData.active_leaf_id;
        const activeLeafObj = leavesData.leaves?.find((l: any) => l.id === activeLeafId);
        setActiveLeaf(activeLeafObj);
        
        // Reload all messages for the new leaf
        const messagesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages?leaf_id=${activeLeafId}`);
        const messagesData = await messagesResponse.json();
        setMessages(messagesData.data || []);
      }
    } catch (error) {
      console.error('Failed to navigate version:', error);
    }
  };

  const handleEditingTextChange = (text: string) => {
    setEditingText(text);
    
    // Update Yjs document
    if (yTextRef.current && editingMessageId) {
      // Replace entire content (simple approach)
      // For production, you'd want to calculate minimal diffs
      const currentContent = yTextRef.current.toString();
      if (currentContent !== text) {
        ydocRef.current?.transact(() => {
          yTextRef.current?.delete(0, yTextRef.current.length);
          yTextRef.current?.insert(0, text);
        });
      }
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
        <View style={styles.headerLeft}>
          <Text style={styles.title}>
            {currentConversation?.title || 'Chat'} 
          </Text>
        </View>
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
      
      <View style={styles.aiToggleContainer}>
        <View style={styles.leafSelector}>
          <Text style={styles.leafLabel}>Branch: </Text>
          <Text style={styles.leafName}>{activeLeaf?.name || 'main'}</Text>
          {leaves.length > 1 && (
            <Text style={styles.leafCount}> ({leaves.length} total)</Text>
          )}
        </View>
        
        <View style={styles.aiToggleRow}>
          <Text style={styles.aiToggleLabel}>AI Mode:</Text>
          <TouchableOpacity
            onPress={() => setAiProactive(!aiProactive)}
            style={[styles.aiToggle, aiProactive && styles.aiToggleActive]}
          >
            <Text style={styles.aiToggleText}>{aiProactive ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>
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
          const versions = messageVersions[msg.id] || [];
          const hasVersions = versions.length > 1;
          let currentVersionIndex = versions.findIndex((v: any) => v.leaf_id === activeLeaf?.id);
          if (currentVersionIndex === -1) currentVersionIndex = 0;
          
          return (
            <View key={msg.id} style={[
              styles.messageGroup,
              isOwn ? styles.ownMessageGroup : styles.otherMessageGroup
            ]}>
              {/* Version navigation */}
              {hasVersions && (
                <View style={styles.versionNav}>
                  <TouchableOpacity
                    onPress={() => {
                      const prevIndex = Math.max(0, currentVersionIndex - 1);
                      navigateToVersion(msg.id, prevIndex);
                    }}
                    disabled={currentVersionIndex === 0}
                    style={[styles.versionArrow, currentVersionIndex === 0 && styles.versionArrowDisabled]}
                  >
                    <Text style={styles.versionArrowText}>←</Text>
                  </TouchableOpacity>
                  
                  <Text style={styles.versionIndicator}>
                    {currentVersionIndex + 1} / {versions.length}
                  </Text>
                  
                  <TouchableOpacity
                    onPress={() => {
                      const nextIndex = Math.min(versions.length - 1, currentVersionIndex + 1);
                      navigateToVersion(msg.id, nextIndex);
                    }}
                    disabled={currentVersionIndex === versions.length - 1}
                    style={[styles.versionArrow, currentVersionIndex === versions.length - 1 && styles.versionArrowDisabled]}
                  >
                    <Text style={styles.versionArrowText}>→</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {/* Document-style content for others, floating overlay for own messages */}
              {isOwn ? (
                <TouchableOpacity
                  style={styles.floatingMessage}
                  onLongPress={async () => {
                  // Check if this is not the last message (editing old message)
                  const isOldMessage = index < messages.length - 1;
                  
                  if (isOldMessage) {
                    // Create a new branch/leaf
                    const response = await fetch(
                      `${API_URL}/v1/conversations/${currentConversation.id}/leaves`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          branch_from_message_id: msg.id,
                          name: `edit-${msg.id.slice(0, 8)}`
                        })
                      }
                    );
                    
                    if (response.ok) {
                      const newLeaf = await response.json();
                      setActiveLeaf(newLeaf);
                      
                      // Reload leaves
                      const leavesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/leaves`);
                      const leavesData = await leavesResponse.json();
                      setLeaves(leavesData.leaves || []);
                      
                      // Switch active leaf on backend
                      await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/leaves/active`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leaf_id: newLeaf.id })
                      });
                      
                      // Reload messages for the new leaf
                      const messagesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages?leaf_id=${newLeaf.id}`);
                      const messagesData = await messagesResponse.json();
                      setMessages(messagesData.data || []);
                    }
                  }
                  
                  setEditingMessageId(msg.id);
                  setEditingText(msg.content);
                  startEditing(msg.id);
                }}
                >
                  <WikiText 
                    text={msg.content}
                    textStyle={styles.floatingMessageText}
                    wikiTagStyle={{
                      color: '#6366f1',
                      textDecorationLine: 'none',
                      fontWeight: '500',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      paddingHorizontal: 2,
                      paddingVertical: 1,
                      borderRadius: 3
                    }}
                    onWikiTagPress={(concept) => {
                      if (navigation) {
                        navigation.navigate('WikiPage', { concept });
                      }
                    }}
                  />
                  {editingSessions.some(s => s.messageId === msg.id) && (
                    <Text style={styles.floatingEditIndicator}>✏️ editing</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.documentContent}
                  onLongPress={async () => {
                    // Check if this is not the last message (editing old message)
                    const isOldMessage = index < messages.length - 1;
                    
                    if (isOldMessage) {
                      // Create a new branch/leaf
                      const response = await fetch(
                        `${API_URL}/v1/conversations/${currentConversation.id}/leaves`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            branch_from_message_id: msg.id,
                            name: `edit-${msg.id.slice(0, 8)}`
                          })
                        }
                      );
                      
                      if (response.ok) {
                        const newLeaf = await response.json();
                        setActiveLeaf(newLeaf);
                        
                        // Reload leaves
                        const leavesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/leaves`);
                        const leavesData = await leavesResponse.json();
                        setLeaves(leavesData.leaves || []);
                        
                        // Switch active leaf on backend
                        await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/leaves/active`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ leaf_id: newLeaf.id })
                        });
                        
                        // Reload messages for the new leaf
                        const messagesResponse = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages?leaf_id=${newLeaf.id}`);
                        const messagesData = await messagesResponse.json();
                        setMessages(messagesData.data || []);
                      }
                    }
                    
                    setEditingMessageId(msg.id);
                    setEditingText(msg.content);
                    startEditing(msg.id);
                  }}
                >
                  {showAuthor && (
                    <View style={styles.documentHeader}>
                      <Text style={styles.documentAuthor}>
                        {msg.author_id === 'ai-1' ? 'Assistant' : 'User'}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.documentBody}>
                    <WikiText 
                      text={msg.content}
                      textStyle={styles.documentText}
                      wikiTagStyle={{
                        color: '#2563eb',
                        textDecorationLine: 'none',
                        fontWeight: '500',
                        backgroundColor: '#eff6ff',
                        paddingHorizontal: 3,
                        paddingVertical: 1,
                        borderRadius: 3,
                        // Ensure proper text baseline alignment
                        textAlignVertical: 'center'
                      }}
                      onWikiTagPress={(concept) => {
                        if (navigation) {
                          navigation.navigate('WikiPage', { concept });
                        }
                      }}
                    />
                  </View>
                  
                  {editingSessions.some(s => s.messageId === msg.id) && (
                    <Text style={styles.documentEditIndicator}>currently being edited</Text>
                  )}
                </TouchableOpacity>
              )}
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
            <Text style={styles.editingTitle}>Edit Message (Yjs CRDT)</Text>
            
            {editingMessageId && editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).length > 0 && (
              <View style={styles.collaboratorsContainer}>
                <Text style={styles.collaboratorsLabel}>
                  👥 Also editing: {editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).map(s => s.userId).join(', ')}
                </Text>
              </View>
            )}
            
            <TextInput
              style={styles.editingInput}
              value={editingText}
              onChangeText={handleEditingTextChange}
              multiline
              autoFocus
            />
            <View style={styles.editingButtons}>
              <TouchableOpacity 
                style={[styles.editingButton, styles.cancelButton]} 
                onPress={() => {
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
                      const response = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages/${editingMessageId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          content: editingText,
                          leaf_id: activeLeaf?.id
                        })
                      });
                      
                      if (response.ok) {
                        // Update the message locally
                        setMessages(prev => prev.map(msg => 
                          msg.id === editingMessageId 
                            ? { ...msg, content: editingText }
                            : msg
                        ));
                        
                        // Reload versions for this message
                        loadMessageVersions(editingMessageId);
                        
                        stopEditing(editingMessageId);
                        setEditingMessageId(null);
                        setEditingText('');
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
    backgroundColor: '#fafafa', // Subtle off-white background
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collaborativeButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  collaborativeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  aiToggleLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 10,
  },
  aiToggle: {
    backgroundColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiToggleActive: {
    backgroundColor: '#4ECDC4',
  },
  aiToggleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  collaborativeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  collaborativeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 10,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
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
    paddingHorizontal: 0, // No side padding for document feel
    paddingVertical: 20,
  },
  messageGroup: {
    marginVertical: 0, // Minimal spacing between messages
  },
  ownMessageGroup: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  otherMessageGroup: {
    alignItems: 'stretch',
    marginVertical: 0,
  },
  // Removed - using new document header instead
  // Subtle overlay for own messages
  floatingMessage: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // Very subtle white
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: '65%',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    // Minimal shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  floatingMessageText: {
    color: '#374151', // Subtle dark gray
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
  },
  floatingEditIndicator: {
    color: 'rgba(107, 114, 128, 0.6)',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 3,
  },
  
  // Document-style content for others
  documentContent: {
    backgroundColor: '#ffffff',
    paddingVertical: 0,
    marginVertical: 0,
  },
  documentHeader: {
    paddingHorizontal: 40,
    paddingTop: 40,
    paddingBottom: 8,
  },
  documentAuthor: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  documentBody: {
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  documentText: {
    fontSize: 18,
    lineHeight: 32,
    color: '#111827',
    letterSpacing: -0.2,
    fontWeight: '400',
  },
  documentEditIndicator: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 16,
    paddingHorizontal: 40,
    paddingBottom: 20,
  },
  // Removed - using new floating/document styles
  // Removed - using specific text styles for each type
  // Removed - using specific edit indicators for each type
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
  versionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  versionArrow: {
    padding: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  versionArrowDisabled: {
    opacity: 0.3,
  },
  versionArrowText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  versionIndicator: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  leafSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  leafLabel: {
    fontSize: 14,
    color: '#666',
  },
  leafName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  leafCount: {
    fontSize: 12,
    color: '#999',
  },
  aiToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});