import { useState, useEffect, useCallback, useRef } from 'react';
import { EditingSession } from '../types';
import { client } from '../api-client/client.gen';
import type { Conversation, Message } from '../api-client/types.gen';

const WS_URL = 'ws://localhost:8000';

// Configure the client
client.setConfig({
  baseUrl: 'http://localhost:8000',
});

export function useBackend() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editingSessions, setEditingSessions] = useState<EditingSession[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Load conversations on mount using generated client
  useEffect(() => {
    client.GET('/v1/conversations')
      .then(({ data }) => {
        if (data && 'data' in data) {
          setConversations(data.data as Conversation[]);
        }
      })
      .catch(console.error);
  }, []);

  const connectToConversation = useCallback((conversationId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_URL}/v1/conversations/${conversationId}/ws`);
    
    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'message') {
        setMessages(prev => [...prev, data.message]);
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
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    wsRef.current = ws;
  }, []);

  const sendMessage = useCallback(async (conversationId: string, authorId: string, content: string) => {
    // Send via REST API (which will broadcast via WebSocket)
    try {
      const { data } = await client.POST('/v1/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: conversationId } },
        body: { author_id: authorId, content }
      });
      if (data) {
        setMessages(prev => [...prev, data as Message]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, []);

  const startEditing = useCallback((messageId: string, userId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'start_editing',
        messageId,
        userId
      }));
    }
  }, []);

  const stopEditing = useCallback((messageId: string, userId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_editing',
        messageId,
        userId
      }));
    }
  }, []);

  return {
    conversations,
    messages,
    editingSessions,
    wsConnected,
    ws: wsRef.current,
    connectToConversation,
    sendMessage,
    startEditing,
    stopEditing
  };
}