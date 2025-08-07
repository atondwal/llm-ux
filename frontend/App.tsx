import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import ChatInterface from './src/components/ChatInterface';
import { Conversation } from './src/types';

export default function App() {
  const mockConversation: Conversation = {
    id: 'demo-1',
    type: 'chat',
    title: 'Demo Chat',
    participants: [
      { id: 'user-1', type: 'human', name: 'You' },
      { id: 'ai-1', type: 'ai', name: 'Assistant' },
    ],
    messages: [
      {
        id: 'msg-1',
        conversationId: 'demo-1',
        authorId: 'ai-1',
        content: 'Welcome! Try typing a message or using [[wiki-tags]] like this.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        conversationId: 'demo-1',
        authorId: 'user-1',
        content: 'This is a demo message. Long press to edit!',
        createdAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  };

  return (
    <View style={styles.container}>
      <ChatInterface 
        conversation={mockConversation}
        currentUserId="user-1"
        onSendMessage={(msg) => console.log('Sending:', msg)}
        onTagClick={(tag) => console.log('Clicked tag:', tag)}
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
});
