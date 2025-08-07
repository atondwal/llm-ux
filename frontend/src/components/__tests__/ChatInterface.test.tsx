/**
 * Test-first development for the ChatInterface component.
 * Writing tests BEFORE implementation following extreme TDD.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChatInterface from '../ChatInterface';
import { Conversation, Message } from '../../types';

describe('ChatInterface', () => {
  const mockConversation: Conversation = {
    id: 'conv-123',
    type: 'chat',
    title: 'Test Conversation',
    participants: [
      { id: 'user-1', type: 'human', name: 'Alice' },
      { id: 'user-2', type: 'human', name: 'Bob' },
    ],
    messages: [],
    createdAt: new Date().toISOString(),
  };

  describe('Message Display', () => {
    it('should render an empty conversation', () => {
      const { getByText, queryByTestId } = render(
        <ChatInterface conversation={mockConversation} currentUserId="user-1" />
      );

      expect(getByText('Test Conversation')).toBeTruthy();
      expect(queryByTestId('message-list')).toBeTruthy();
      expect(queryByTestId('message-item')).toBeNull();
    });

    it('should display messages in the conversation', () => {
      const conversationWithMessages: Conversation = {
        ...mockConversation,
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-123',
            authorId: 'user-1',
            content: 'Hello, Bob!',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'msg-2',
            conversationId: 'conv-123',
            authorId: 'user-2',
            content: 'Hi Alice!',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const { getByText } = render(
        <ChatInterface conversation={conversationWithMessages} currentUserId="user-1" />
      );

      expect(getByText('Hello, Bob!')).toBeTruthy();
      expect(getByText('Hi Alice!')).toBeTruthy();
    });
  });

  describe('Message Input', () => {
    it('should have a message input field', () => {
      const { getByPlaceholderText } = render(
        <ChatInterface conversation={mockConversation} currentUserId="user-1" />
      );

      const input = getByPlaceholderText('Type a message...');
      expect(input).toBeTruthy();
    });

    it('should allow typing in the message input', () => {
      const { getByPlaceholderText } = render(
        <ChatInterface conversation={mockConversation} currentUserId="user-1" />
      );

      const input = getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'New message');
      
      expect(input.props.value).toBe('New message');
    });

    it('should send a message when send button is pressed', async () => {
      const onSendMessage = jest.fn();
      const { getByPlaceholderText, getByTestId } = render(
        <ChatInterface 
          conversation={mockConversation} 
          currentUserId="user-1"
          onSendMessage={onSendMessage}
        />
      );

      const input = getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, 'Test message');
      
      const sendButton = getByTestId('send-button');
      fireEvent.press(sendButton);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith({
          content: 'Test message',
          authorId: 'user-1',
        });
      });

      // Input should be cleared after sending
      expect(input.props.value).toBe('');
    });

    it('should not send empty messages', () => {
      const onSendMessage = jest.fn();
      const { getByTestId } = render(
        <ChatInterface 
          conversation={mockConversation} 
          currentUserId="user-1"
          onSendMessage={onSendMessage}
        />
      );

      const sendButton = getByTestId('send-button');
      fireEvent.press(sendButton);

      expect(onSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Wiki Tags', () => {
    it('should highlight wiki tags in messages', () => {
      const messageWithTag: Conversation = {
        ...mockConversation,
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-123',
            authorId: 'user-1',
            content: 'Let\'s discuss [[machine-learning]] today',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const { getByTestId } = render(
        <ChatInterface conversation={messageWithTag} currentUserId="user-1" />
      );

      const tagElement = getByTestId('wiki-tag-machine-learning');
      expect(tagElement).toBeTruthy();
      expect(tagElement.props.children).toContain('machine-learning');
    });

    it('should handle clicking on wiki tags', () => {
      const onTagClick = jest.fn();
      const messageWithTag: Conversation = {
        ...mockConversation,
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-123',
            authorId: 'user-1',
            content: 'Check out [[react-native]]',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const { getByTestId } = render(
        <ChatInterface 
          conversation={messageWithTag} 
          currentUserId="user-1"
          onTagClick={onTagClick}
        />
      );

      const tag = getByTestId('wiki-tag-react-native');
      fireEvent.press(tag);

      expect(onTagClick).toHaveBeenCalledWith('react-native');
    });
  });

  describe('Collaborative Editing', () => {
    it('should allow editing own messages', () => {
      const conversationWithMessage: Conversation = {
        ...mockConversation,
        messages: [
          {
            id: 'msg-1',
            conversationId: 'conv-123',
            authorId: 'user-1',
            content: 'Original message',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const { getByTestId, getByDisplayValue } = render(
        <ChatInterface conversation={conversationWithMessage} currentUserId="user-1" />
      );

      const message = getByTestId('message-msg-1');
      fireEvent(message, 'onLongPress');

      // Should enter edit mode
      const editInput = getByDisplayValue('Original message');
      expect(editInput).toBeTruthy();

      fireEvent.changeText(editInput, 'Edited message');
      fireEvent(editInput, 'onSubmitEditing');

      expect(getByTestId('message-msg-1').props.children).toContain('Edited message');
    });

    it('should show live cursors when others are editing', () => {
      const { getByTestId } = render(
        <ChatInterface 
          conversation={mockConversation} 
          currentUserId="user-1"
          editingSessions={[
            { messageId: 'msg-1', userId: 'user-2', userName: 'Bob' }
          ]}
        />
      );

      const cursor = getByTestId('editing-cursor-user-2');
      expect(cursor).toBeTruthy();
      expect(cursor.props.children).toContain('Bob');
    });
  });

  describe('AI Integration', () => {
    it('should show AI toggle for proactive mode', () => {
      const { getByTestId } = render(
        <ChatInterface conversation={mockConversation} currentUserId="user-1" />
      );

      const aiToggle = getByTestId('ai-proactive-toggle');
      expect(aiToggle).toBeTruthy();
      expect(aiToggle.props.value).toBe(false); // Default off for human chats
    });

    it('should allow tagging AI for help', () => {
      const onSendMessage = jest.fn();
      const { getByPlaceholderText, getByTestId } = render(
        <ChatInterface 
          conversation={mockConversation} 
          currentUserId="user-1"
          onSendMessage={onSendMessage}
        />
      );

      const input = getByPlaceholderText('Type a message...');
      fireEvent.changeText(input, '@ai help me understand React hooks');
      
      const sendButton = getByTestId('send-button');
      fireEvent.press(sendButton);

      expect(onSendMessage).toHaveBeenCalledWith({
        content: '@ai help me understand React hooks',
        authorId: 'user-1',
        mentionsAI: true,
      });
    });
  });
});