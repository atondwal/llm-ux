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
  
  // Sidebar state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [allConversations, setAllConversations] = useState<any[]>([]);
  // Debug: Track editingMessageId changes
  useEffect(() => {
    console.log("🎯 editingMessageId changed to:", editingMessageId);
  }, [editingMessageId]);
  const [editingText, setEditingText] = useState('');
  const [aiProactive, setAiProactive] = useState(false);
  const [lastClickTime, setLastClickTime] = useState<{[key: string]: number}>({});
  
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
        setAllConversations(convs);
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
      const conversationNumber = allConversations.filter(c => c.type === 'chat').length + 1;
      const response = await fetch(`${API_URL}/v1/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `conv-${Date.now()}`,
          type: 'chat',
          title: `Chat ${conversationNumber}`,
          participants: [
            { id: 'user-1', type: 'human', name: 'You' },
            { id: 'ai-1', type: 'ai', name: 'Assistant' }
          ],
          messages: [],
          created_at: new Date().toISOString()
        })
      });
      const conv = await response.json();
      setAllConversations(prev => [...prev, conv]);
      selectConversation(conv);
    } catch (error) {
      console.error('Failed to create conversation:', error);
      setLoading(false);
    }
  };

  const selectConversation = async (conv: any) => {
    // Clean up existing connections
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    
    setCurrentConversation(conv);
    setLoading(true);
    
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
    console.log('🟢 startEditing called for messageId:', messageId);
    // Notify others via regular WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('📤 Sending start_editing WebSocket message');
      wsRef.current.send(JSON.stringify({
        type: 'start_editing',
        messageId,
        userId: currentUserId
      }));
    } else {
      console.log('❌ WebSocket not connected, cannot send start_editing');
    }

    // Clean up previous Yjs connection if any
    if (providerRef.current) {
      providerRef.current.destroy();
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
    }

    // Create new Yjs document for this message
    console.log('📄 Creating new Yjs document');
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Create collaborative text
    const ytext = ydoc.getText('content');
    yTextRef.current = ytext;
    console.log('📝 Created Yjs text object');

    // Use leaf-specific room name for Yjs
    const roomName = activeLeaf ? `${activeLeaf.id}-${messageId}` : messageId;
    
    // Connect to Yjs WebSocket endpoint for this specific message and leaf
    console.log('🔌 Connecting to Yjs WebSocket, roomName:', roomName);
    console.log("🏠 Full WebSocket URL:", `ws://localhost:8000/ws/collaborative/${roomName}`);
    const provider = new WebsocketProvider(
      `ws://localhost:8000/ws/collaborative`,
      roomName, // Use leaf-specific room name
      ydoc
    );

    provider.on('status', (event: any) => {
      console.log('🔗 Yjs connection status:', event.status);
    });

    provider.on('connection-error', (error: any) => {
      console.error('🚨 Yjs connection error:', error);
    });

    provider.on('connection-close', (event: any) => {
      console.warn('🔒 Yjs connection closed:', event);
    });

    // Wait for initial sync before setting content
    provider.on('synced', (synced: boolean) => {
      console.log('🔄 Yjs synced:', synced);
      if (synced) {
        // Only set initial content if the document is empty (first editor)
        if (ytext.length === 0) {
          const message = messages.find(m => m.id === messageId);
          if (message) {
            console.log('📝 Setting initial Yjs content:', message.content.substring(0, 50) + '...');
            ytext.insert(0, message.content);
          }
        } else {
          console.log('📝 Yjs document already has content, length:', ytext.length);
        }
        // Set the current text from the synced document
        const yjsContent = ytext.toString();
        console.log('📝 Setting editingText from Yjs:', yjsContent.substring(0, 50) + '...');
        setEditingText(yjsContent);
      }
    });

    // Observe text changes from other users
    ytext.observe(() => {
      console.log('👁️ Yjs text changed, messageId check:', editingMessageIdRef.current === messageId);
        console.log("📋 Current editingMessageId:", editingMessageIdRef.current, "Expected:", messageId);
      if (editingMessageIdRef.current === messageId) {
        const newText = ytext.toString();
        console.log('📝 Updating editingText from Yjs observer:', newText.substring(0, 50) + '...');
        setEditingText(newText);
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
    console.log('⌨️ handleEditingTextChange called, text length:', text.length, 'first 50 chars:', text.substring(0, 50) + '...');
    setEditingText(text);
    
    // Update Yjs document
    if (yTextRef.current && editingMessageId) {
      console.log('📝 Updating Yjs document');
      // Replace entire content (simple approach)
      // For production, you'd want to calculate minimal diffs
      const currentContent = yTextRef.current.toString();
      if (currentContent !== text) {
        console.log('🔄 Yjs content differs, updating. Current:', currentContent.substring(0, 30), 'New:', text.substring(0, 30));
        console.log("🚀 Yjs transaction: deleting", yTextRef.current.length, "chars, inserting", text.length, "chars");
        ydocRef.current?.transact(() => {
          yTextRef.current?.delete(0, yTextRef.current.length);
          yTextRef.current?.insert(0, text);
        });
      } else {
        console.log('✅ Yjs content same as input, no update needed');
      }
    } else {
      console.log('❌ No yTextRef or editingMessageId:', !!yTextRef.current, editingMessageId);
    }
  };


  // Save current edit with Yjs integration
  const saveEdit = async () => {
    console.log('💾 saveEdit called, editingMessageId:', editingMessageId);
    if (editingMessageId && currentConversation) {
      try {
        // Get final content from Yjs document
        const finalContent = yTextRef.current ? yTextRef.current.toString() : editingText;
        console.log('📝 Final content for save (Yjs):', yTextRef.current ? 'FROM_YJS' : 'FROM_STATE', finalContent.substring(0, 50) + '...');
        
        const response = await fetch(`${API_URL}/v1/conversations/${currentConversation.id}/messages/${editingMessageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: finalContent,
            leaf_id: activeLeaf?.id
          })
        });
        
        if (response.ok) {
          setMessages(prev => prev.map(m => 
            m.id === editingMessageId 
              ? { ...m, content: finalContent }
              : m
          ));
          
          loadMessageVersions(editingMessageId);
          stopEditing(editingMessageId);
          setEditingMessageId(null);
          setEditingText('');
        }
      } catch (error) {
        console.error('Error updating message:', error);
      }
    }
  };

  // Cancel current edit
  const cancelEdit = () => {
    if (editingMessageId) {
      // Revert to original content
      const originalMessage = messages.find(m => m.id === editingMessageId);
      if (originalMessage && yTextRef.current) {
        // Reset Yjs document to original content
        ydocRef.current?.transact(() => {
          yTextRef.current?.delete(0, yTextRef.current.length);
          yTextRef.current?.insert(0, originalMessage.content);
        });
        setEditingText(originalMessage.content);
      }
      
      stopEditing(editingMessageId);
      setEditingMessageId(null);
      setEditingText('');
    }
  };

  // Handle double-click detection
  const handleDoubleClick = (messageId: string, messageContent: string) => {
    const now = Date.now();
    const lastClick = lastClickTime[messageId] || 0;
    const timeDiff = now - lastClick;
    
    console.log('👆 Double-click detected, messageId:', messageId, 'timeDiff:', timeDiff);
    setLastClickTime(prev => ({ ...prev, [messageId]: now }));
    
    // If clicked within 500ms, it's a double click
    if (timeDiff < 500 && timeDiff > 50) {
      console.log('✅ Valid double-click, starting edit for:', messageId);
      // Start editing
      setEditingMessageId(messageId);
      setEditingText(messageContent);
      startEditing(messageId);
    } else {
      console.log('❌ Not a valid double-click, timeDiff:', timeDiff);
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
    <View style={styles.appContainer}>
      {/* Sidebar */}
      <View style={[styles.sidebar, !sidebarVisible && styles.sidebarHidden]}>
        <TouchableOpacity style={styles.newConvButton} onPress={createNewConversation}>
          <Text style={styles.newConvButtonText}>+ New Chat</Text>
        </TouchableOpacity>
        
        <ScrollView style={styles.convList}>
          {allConversations.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={[
                styles.convItem,
                conv.id === currentConversation?.id && styles.convItemActive
              ]}
              onPress={() => selectConversation(conv)}
            >
              <Text style={styles.convIcon}>
                {conv.type === 'wiki' ? '📚' : '💬'}
              </Text>
              <Text style={styles.convTitle} numberOfLines={1}>
                {conv.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {/* Main Chat Area */}
      <View style={styles.mainContent}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.sidebarToggle}
            onPress={() => setSidebarVisible(!sidebarVisible)}
          >
            <Text style={styles.hamburgerIcon}>☰</Text>
          </TouchableOpacity>
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
                editingMessageId === msg.id ? (
                  <View style={styles.inlineFloatingEditor}>
                    <TextInput
                      style={styles.floatingEditInput}
                      value={editingText}
                      onChangeText={handleEditingTextChange}
                      // onBlur={saveEdit} // Temporarily disabled
                      onKeyPress={(e) => {
                        if (e.nativeEvent.key === 'Escape') {
                          cancelEdit();
                        } else if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        }
                      }}
                      multiline
                      autoFocus
                      placeholder="Edit your message..."
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.floatingMessage}
                    onPress={() => handleDoubleClick(msg.id, msg.content)}
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
                )
              ) : (
                editingMessageId === msg.id ? (
                  <View style={styles.documentContent}>
                    {showAuthor && (
                      <View style={styles.documentHeader}>
                        <Text style={styles.documentAuthor}>
                          {msg.author_id === 'ai-1' ? 'Assistant' : 'User'}
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.inlineEditor}>
                      <TextInput
                        style={styles.inlineEditInput}
                        value={editingText}
                        onChangeText={handleEditingTextChange}
                        // onBlur={saveEdit} // Temporarily disabled
                        onKeyPress={(e) => {
                          if (e.nativeEvent.key === 'Escape') {
                            cancelEdit();
                          } else if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        multiline
                        autoFocus
                        placeholder="Edit your message..."
                      />
                      
                      {editingMessageId && editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).length > 0 && (
                        <Text style={styles.inlineCollaborators}>
                          👥 Also editing: {editingSessions.filter(s => s.messageId === editingMessageId && s.userId !== currentUserId).map(s => s.userId).join(', ')}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.documentContent}
                    onPress={() => handleDoubleClick(msg.id, msg.content)}
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
                )
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


      <StatusBar style="auto" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 250,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  sidebarHidden: {
    width: 0,
    overflow: 'hidden',
  },
  newConvButton: {
    margin: 10,
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  newConvButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  convList: {
    flex: 1,
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  convItemActive: {
    backgroundColor: '#e3f2fd',
  },
  convIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  convTitle: {
    flex: 1,
    fontSize: 14,
  },
  mainContent: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  sidebarToggle: {
    padding: 8,
    marginRight: 8,
  },
  hamburgerIcon: {
    fontSize: 20,
  },
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomRightRadius: 4, // Teardrop effect
    maxWidth: '65%',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    // Minimal shadow
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
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
  
  // Inline editing styles
  inlineEditor: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  inlineEditInput: {
    fontSize: 18,
    lineHeight: 32,
    color: '#111827',
    letterSpacing: -0.2,
    fontWeight: '400',
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
  },
  inlineCollaborators: {
    fontSize: 12,
    color: '#059669',
    fontStyle: 'italic',
    marginBottom: 12,
    backgroundColor: '#ecfdf5',
    padding: 8,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  
  // Floating message inline editing
  inlineFloatingEditor: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    maxWidth: '70%',
    borderWidth: 2,
    borderColor: '#3b82f6',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
    elevation: 4,
  },
  floatingEditInput: {
    fontSize: 14,
    lineHeight: 19,
    color: '#374151',
    fontWeight: '400',
    minHeight: 40,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
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