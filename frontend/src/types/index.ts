/**
 * Type definitions for the frontend.
 * Matching the backend Pydantic models for consistency.
 */

export type ParticipantType = 'human' | 'ai';
export type ConversationType = 'chat' | 'wiki_tag';

export interface Participant {
  id: string;
  type: ParticipantType;
  name: string;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  createdAt: string;
  editedAt?: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  participants: Participant[];
  messages: Message[];
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface EditingSession {
  messageId: string;
  userId: string;
  userName: string;
}

export interface ChatInterfaceProps {
  conversation: Conversation;
  currentUserId: string;
  onSendMessage?: (message: Omit<Message, 'id' | 'conversationId' | 'createdAt'> & { mentionsAI?: boolean }) => void;
  onTagClick?: (tag: string) => void;
  editingSessions?: EditingSession[];
}

// Zod schemas for runtime validation
import { z } from 'zod';

export const ParticipantSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['human', 'ai']),
  name: z.string().min(1),
});

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string().min(1),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().optional(),
});

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['chat', 'wiki_tag']),
  title: z.string().min(1),
  participants: z.array(ParticipantSchema),
  messages: z.array(MessageSchema),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Type guards
export const isValidConversation = (data: unknown): data is Conversation => {
  try {
    ConversationSchema.parse(data);
    return true;
  } catch {
    return false;
  }
};