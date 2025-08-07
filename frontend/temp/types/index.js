"use strict";
/**
 * Type definitions for the frontend.
 * Matching the backend Pydantic models for consistency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidConversation = exports.ConversationSchema = exports.MessageSchema = exports.ParticipantSchema = void 0;
// Zod schemas for runtime validation
var zod_1 = require("zod");
exports.ParticipantSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['human', 'ai']),
    name: zod_1.z.string().min(1),
});
exports.MessageSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    conversationId: zod_1.z.string().uuid(),
    authorId: zod_1.z.string().uuid(),
    content: zod_1.z.string().min(1),
    createdAt: zod_1.z.string().datetime(),
    editedAt: zod_1.z.string().datetime().optional(),
});
exports.ConversationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['chat', 'wiki_tag']),
    title: zod_1.z.string().min(1),
    participants: zod_1.z.array(exports.ParticipantSchema),
    messages: zod_1.z.array(exports.MessageSchema),
    createdAt: zod_1.z.string().datetime(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
});
// Type guards
var isValidConversation = function (data) {
    try {
        exports.ConversationSchema.parse(data);
        return true;
    }
    catch (_a) {
        return false;
    }
};
exports.isValidConversation = isValidConversation;
