/**
 * ChatInterface component - collaborative editing interface like Etherpad.
 * Following extreme TDD - implementing collaborative real-time editing.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Modal,
} from 'react-native';
import { ChatInterfaceProps, Message } from '../types';
import CollaborativeEditor from './CollaborativeEditor';

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversation,
  currentUserId,
  onSendMessage,
  onTagClick,
  editingSessions = [],
}) => {
  const [inputText, setInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [aiProactive, setAiProactive] = useState(conversation.type === 'chat' ? false : true);
  const [showCollaborativeView, setShowCollaborativeView] = useState(false);

  const handleSend = useCallback(() => {
    if (!inputText.trim()) return;

    const mentionsAI = inputText.includes('@ai');
    
    onSendMessage?.({
      content: inputText,
      authorId: currentUserId,
      ...(mentionsAI && { mentionsAI: true }),
    });

    setInputText('');
  }, [inputText, currentUserId, onSendMessage]);

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditText(content);
  }, []);

  const [localMessages, setLocalMessages] = useState(conversation.messages);

  const handleSaveEdit = useCallback(() => {
    // Update message content locally (in real app, would sync)
    setLocalMessages(prev => prev.map(msg => 
      msg.id === editingMessageId ? { ...msg, content: editText } : msg
    ));
    setEditingMessageId(null);
    setEditText('');
  }, [editText, editingMessageId]);

  const renderWikiTags = useCallback((content: string) => {
    const tagRegex = /\[\[([^\]]+)\]\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      // Add text before tag
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`text-${lastIndex}`}>
            {content.substring(lastIndex, match.index)}
          </Text>
        );
      }

      // Add tag as clickable
      const tagName = match[1]!;
      parts.push(
        <TouchableOpacity
          key={`tag-${match.index}`}
          testID={`wiki-tag-${tagName}`}
          onPress={() => onTagClick?.(tagName)}
        >
          {tagName}
        </TouchableOpacity>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <Text key={`text-${lastIndex}`}>
          {content.substring(lastIndex)}
        </Text>
      );
    }

    // Parts will always have content if we reach here (content with no tags adds full text)
    return parts;
  }, [onTagClick]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isOwnMessage = item.authorId === currentUserId;
    const isEditing = editingMessageId === item.id;
    const editingSession = editingSessions.find(s => s.messageId === item.id);

    return (
      <TouchableOpacity
        testID={`message-${item.id}`}
        onLongPress={() => isOwnMessage && handleEditMessage(item.id, item.content)}
        style={[styles.messageContainer, isOwnMessage && styles.ownMessage]}
      >
        {editingSession && (
          <View testID={`editing-cursor-${editingSession.userId}`}>
            <Text style={styles.editingIndicator}>{editingSession.userName}</Text>
          </View>
        )}
        
        {isEditing ? (
          <TextInput
            value={editText}
            onChangeText={setEditText}
            onSubmitEditing={handleSaveEdit}
            style={styles.editInput}
          />
        ) : item.content.includes('[[') ? (
          renderWikiTags(item.content)
        ) : (
          <Text>{item.content}</Text>
        )}
      </TouchableOpacity>
    );
  }, [currentUserId, editingMessageId, editText, editingSessions, handleEditMessage, handleSaveEdit, renderWikiTags]);

  const toggleCollaborativeView = useCallback(() => {
    setShowCollaborativeView(!showCollaborativeView);
  }, [showCollaborativeView]);

  if (showCollaborativeView) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.fullScreenContainer}>
          <View style={styles.collaborativeHeader}>
            <Text style={styles.collaborativeTitle}>{conversation.title}</Text>
            <TouchableOpacity
              onPress={toggleCollaborativeView}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <CollaborativeEditor
            documentId={conversation.id}
            userId={currentUserId}
            userName={`User-${currentUserId.slice(0, 8)}`}
            onContentChange={(content) => {
              // Handle content changes
              console.log('Content changed:', content);
            }}
          />
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{conversation.title}</Text>
        <TouchableOpacity
          onPress={toggleCollaborativeView}
          style={styles.collaborativeButton}
        >
          <Text style={styles.collaborativeButtonText}>📝 Collaborate</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.aiToggleContainer}>
        <Text>AI Proactive Mode:</Text>
        <Switch
          testID="ai-proactive-toggle"
          value={aiProactive}
          onValueChange={setAiProactive}
        />
      </View>

      <FlatList
        testID="message-list"
        data={localMessages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
      />

      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          style={styles.input}
        />
        <TouchableOpacity
          testID="send-button"
          onPress={handleSend}
          style={styles.sendButton}
        >
          <Text>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  collaborativeButton: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  collaborativeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  collaborativeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  collaborativeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    backgroundColor: '#FF6B6B',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  aiToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  messageList: {
    flex: 1,
  },
  messageContainer: {
    padding: 12,
    marginVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  ownMessage: {
    backgroundColor: '#e3f2fd',
    alignSelf: 'flex-end',
  },
  editingIndicator: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#666',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    borderRadius: 4,
  },
  wikiTag: {
    color: '#2196F3',
    textDecorationLine: 'underline',
  },
  inputContainer: {
    flexDirection: 'row',
    marginTop: 16,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 4,
    justifyContent: 'center',
  },
});

export default ChatInterface;