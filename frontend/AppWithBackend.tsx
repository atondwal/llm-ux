import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import ChatInterface from './src/components/ChatInterface';
import { useBackend } from './src/hooks/useBackend';

export default function App() {
  const { 
    conversations, 
    messages,
    editingSessions,
    wsConnected, 
    connectToConversation,
    sendMessage,
    startEditing,
    stopEditing
  } = useBackend();
  
  const [currentConversation, setCurrentConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use first conversation or create one
    if (conversations.length > 0) {
      const conv = conversations[0];
      setCurrentConversation({
        ...conv,
        messages: messages // Use real-time messages from WebSocket
      });
      connectToConversation(conv.id);
      setLoading(false);
    } else if (conversations.length === 0 && !loading) {
      // No conversations exist, show demo
      setCurrentConversation({
        id: 'demo-1',
        type: 'chat',
        title: 'Demo Chat (Backend not connected)',
        participants: [
          { id: 'user-1', type: 'human', name: 'You' },
        ],
        messages: [{
          id: 'msg-1',
          conversationId: 'demo-1',
          authorId: 'system',
          content: 'Backend not connected. Start the backend with: cd backend && make dev',
          createdAt: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
      });
    }
    
    // Give it a moment to load
    setTimeout(() => setLoading(false), 1000);
  }, [conversations, messages, connectToConversation]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Connecting to backend...</Text>
      </View>
    );
  }

  if (!currentConversation) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>No conversation loaded</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </Text>
        {editingSessions.length > 0 && (
          <Text style={styles.statusText}>
            {editingSessions.length} user(s) editing
          </Text>
        )}
      </View>
      <ChatInterface 
        conversation={currentConversation}
        currentUserId="user-1"
        onSendMessage={(content) => sendMessage('user-1', content)}
        onEditMessage={(messageId, content) => {
          // For now, just log it
          console.log('Edit message:', messageId, content);
        }}
        onTagClick={(tag) => console.log('Clicked tag:', tag)}
        editingSessions={editingSessions}
      />
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
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
  },
});