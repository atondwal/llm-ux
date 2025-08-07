/**
 * Tests for API client service.
 * Following extreme TDD - tests first!
 */

import { ApiClient } from '../api';
import { Conversation, Message } from '../../types';

// Mock fetch globally
global.fetch = jest.fn();

describe('ApiClient', () => {
  let apiClient: ApiClient;

  beforeEach(() => {
    apiClient = new ApiClient();
    jest.clearAllMocks();
  });

  describe('getConversations', () => {
    it('should fetch conversations list', async () => {
      const mockConversations: Conversation[] = [
        {
          id: 'conv-1',
          type: 'chat',
          title: 'Test Chat',
          participants: [],
          messages: [],
          createdAt: new Date().toISOString(),
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockConversations }),
      });

      const result = await apiClient.getConversations();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/v1/conversations');
      expect(result).toEqual(mockConversations);
    });

    it('should throw error when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(apiClient.getConversations()).rejects.toThrow('Failed to fetch conversations');
    });
  });

  describe('getConversation', () => {
    it('should fetch a single conversation', async () => {
      const mockConversation: Conversation = {
        id: 'conv-1',
        type: 'chat',
        title: 'Test Chat',
        participants: [],
        messages: [],
        createdAt: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockConversation,
      });

      const result = await apiClient.getConversation('conv-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/v1/conversations/conv-1');
      expect(result).toEqual(mockConversation);
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const newConversation: Conversation = {
        id: 'new-conv',
        type: 'chat',
        title: 'New Chat',
        participants: [],
        messages: [],
        createdAt: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => newConversation,
      });

      const result = await apiClient.createConversation('chat', 'New Chat', []);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/conversations',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'chat', title: 'New Chat', participants: [] }),
        })
      );
      expect(result).toEqual(newConversation);
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a conversation', async () => {
      const mockMessage: Message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        authorId: 'user-1',
        content: 'Hello',
        createdAt: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      });

      const result = await apiClient.sendMessage('conv-1', 'user-1', 'Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/conversations/conv-1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorId: 'user-1', content: 'Hello' }),
        })
      );
      expect(result).toEqual(mockMessage);
    });
  });

  describe('updateMessage', () => {
    it('should update an existing message', async () => {
      const updatedMessage: Message = {
        id: 'msg-1',
        conversationId: 'conv-1',
        authorId: 'user-1',
        content: 'Updated content',
        createdAt: new Date().toISOString(),
        editedAt: new Date().toISOString(),
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedMessage,
      });

      const result = await apiClient.updateMessage('conv-1', 'msg-1', 'Updated content');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/conversations/conv-1/messages/msg-1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'Updated content' }),
        })
      );
      expect(result).toEqual(updatedMessage);
    });
  });
});