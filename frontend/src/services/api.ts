import { Conversation, Message, Participant } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export class ApiClient {
  async getConversations(): Promise<Conversation[]> {
    const response = await fetch(`${API_BASE_URL}/v1/conversations`);
    if (!response.ok) throw new Error('Failed to fetch conversations');
    const data = await response.json();
    return data.data;
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${API_BASE_URL}/v1/conversations/${id}`);
    if (!response.ok) throw new Error('Failed to fetch conversation');
    return response.json();
  }

  async createConversation(
    type: 'chat' | 'wiki_tag',
    title: string,
    participants: Participant[]
  ): Promise<Conversation> {
    const response = await fetch(`${API_BASE_URL}/v1/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, participants }),
    });
    if (!response.ok) throw new Error('Failed to create conversation');
    return response.json();
  }

  async sendMessage(conversationId: string, authorId: string, content: string): Promise<Message> {
    const response = await fetch(`${API_BASE_URL}/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorId, content }),
    });
    if (!response.ok) throw new Error('Failed to send message');
    return response.json();
  }

  async updateMessage(
    conversationId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    const response = await fetch(
      `${API_BASE_URL}/v1/conversations/${conversationId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) throw new Error('Failed to update message');
    return response.json();
  }
}