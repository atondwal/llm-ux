import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { extractWikiConcepts } from '../utils/wikiTagParser';
import WikiText from '../components/WikiText';

const API_URL = 'http://localhost:8000';

interface WikiPageProps {
  navigation: any;
  route: any;
}

interface Message {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
}

const WikiPage: React.FC<WikiPageProps> = ({ navigation, route }) => {
  const { concept } = route.params;
  const [relatedMessages, setRelatedMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [wikiContent, setWikiContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingContent, setEditingContent] = useState<string>('');

  useEffect(() => {
    loadRelatedMessages();
    loadWikiContent();
  }, [concept]);

  const loadRelatedMessages = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading related messages for concept:', concept);
      
      // Fetch all conversations and their messages
      const conversationsResponse = await fetch(`${API_URL}/v1/conversations`);
      const conversationsData = await conversationsResponse.json();
      console.log('📝 Conversations fetched:', conversationsData);
      
      const allMessages: Message[] = [];
      
      // Get messages from all conversations
      for (const conversation of conversationsData.data || []) {
        console.log('📨 Fetching messages for conversation:', conversation.id);
        const messagesResponse = await fetch(`${API_URL}/v1/conversations/${conversation.id}/messages`);
        const messagesData = await messagesResponse.json();
        console.log(`📨 Messages for ${conversation.id}:`, messagesData);
        allMessages.push(...(messagesData.data || []));
      }
      
      console.log('📨 Total messages found:', allMessages.length);
      
      // Filter messages that contain this concept
      const filtered = allMessages.filter(message => {
        const concepts = extractWikiConcepts(message.content);
        const hasThisConcept = concepts.includes(concept);
        if (hasThisConcept) {
          console.log('✅ Message contains concept:', { messageId: message.id, content: message.content, concepts });
        }
        return hasThisConcept;
      });
      
      console.log('🎯 Filtered messages for concept "' + concept + '":', filtered);
      setRelatedMessages(filtered);
    } catch (error) {
      console.error('Failed to load related messages:', error);
      setRelatedMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadWikiContent = async () => {
    // TODO: Load wiki content from backend
    // For now, just set empty content
    setWikiContent('');
  };

  const handleEditWiki = () => {
    setEditingContent(wikiContent);
    setIsEditing(true);
  };

  const handleSaveWiki = () => {
    setWikiContent(editingContent);
    setIsEditing(false);
    // TODO: Save to backend when wiki content persistence is added
    console.log('Saved wiki content for:', concept, editingContent);
  };

  const handleCancelEdit = () => {
    setEditingContent('');
    setIsEditing(false);
  };

  const handleWikiTagPress = (taggedConcept: string) => {
    // Navigate to another wiki page
    navigation.push('WikiPage', { concept: taggedConcept });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{concept}</Text>
      </View>

      {/* Wiki Content Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>About {concept}</Text>
          {!isEditing ? (
            <TouchableOpacity 
              style={styles.editButton}
              onPress={handleEditWiki}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editButtonGroup}>
              <TouchableOpacity 
                style={[styles.editButton, styles.cancelButton]}
                onPress={handleCancelEdit}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.editButton, styles.saveButton]}
                onPress={handleSaveWiki}
              >
                <Text style={styles.editButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        <View style={styles.wikiContent}>
          {isEditing ? (
            <TextInput
              style={styles.editingTextArea}
              value={editingContent}
              onChangeText={setEditingContent}
              placeholder={`Write about ${concept}...`}
              multiline
              autoFocus
            />
          ) : wikiContent ? (
            <WikiText 
              text={wikiContent}
              onWikiTagPress={handleWikiTagPress}
              textStyle={styles.wikiText}
            />
          ) : (
            <Text style={styles.placeholderText}>
              This concept has not been documented yet.
            </Text>
          )}
        </View>
      </View>

      {/* Related Messages Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Messages mentioning this concept:</Text>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Loading related messages...</Text>
          </View>
        ) : relatedMessages.length > 0 ? (
          <View style={styles.messagesList}>
            {relatedMessages.map((message) => (
              <View key={message.id} style={styles.messageItem}>
                <View style={styles.messageHeader}>
                  <Text style={styles.messageAuthor}>
                    {message.author_id === 'ai-1' ? 'Assistant' : message.author_id}
                  </Text>
                  <Text style={styles.messageDate}>
                    {new Date(message.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <WikiText 
                  text={message.content}
                  onWikiTagPress={handleWikiTagPress}
                  textStyle={styles.messageText}
                  wikiTagStyle={styles.messageWikiTag}
                />
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.placeholderText}>
            No messages mention this concept yet.
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
  header: {
    backgroundColor: '#fff',
    padding: 16,
    paddingTop: 60, // Account for status bar
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  editButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  wikiContent: {
    minHeight: 80,
  },
  wikiText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  messagesList: {
    gap: 12,
  },
  messageItem: {
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    paddingLeft: 12,
    paddingVertical: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  messageAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  messageDate: {
    fontSize: 12,
    color: '#999',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  messageWikiTag: {
    color: '#007AFF',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  editButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  editingTextArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
    textAlignVertical: 'top',
  },
});

export default WikiPage;