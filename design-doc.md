# Collaborative Chat & Knowledge System Design Document

**Author:** Claude & User  
**Date:** 2025-08-07  
**Status:** Draft

## TL;DR
A clean, hackable chat system that's as intuitive as Signal for messaging, as powerful as Claude Code for AI assistance, and as knowledge-rich as Logseq for building understanding. Everything is a conversation - human chats, AI chats, and wiki pages all use the same unified abstraction with OpenAI-compatible APIs.

## Problem Statement
Current tools make you choose between simple and powerful:
- **Messaging apps** are delightful but shallow (no knowledge building)
- **AI tools** are powerful but isolated (no human collaboration) 
- **PKM systems** are rich but clunky (poor conversation flow)
- **Developer tools** are capable but intimidating (high barrier to entry)

We want the **joy** of texting friends combined with the **power** of programming tools.

## Design Philosophy

### Fun Like Messaging Apps
- **Instant gratification**: Messages send immediately, responses feel snappy
- **Zero friction**: No setup, accounts, or configuration required to start
- **Natural interactions**: Feels like texting, not using "software"
- **Delightful details**: Smooth animations, satisfying feedback

### Fun Like Claude Code  
- **Powerful primitives**: Simple building blocks that compose beautifully
- **Keyboard-driven**: Everything accessible via shortcuts and commands
- **Extensible**: API-first design, hackable architecture
- **Progressive disclosure**: Simple on surface, deep when you need it

### Unix Philosophy
- **Do one thing well**: Conversations with collaborative knowledge building
- **Composable**: Everything built on same conversation abstraction
- **API-first**: OpenAI-compatible with extensions
- **Exportable**: Your data in plain text formats

## Core Architecture: Everything is a Conversation

### Unified Conversation Model
All functionality built on a single abstraction:

```typescript
type Conversation = {
  id: string
  type: 'chat' | 'wiki_tag' // UI hint only
  title?: string
  participants: Participant[]
  messages: Message[]
  created_at: timestamp
  metadata?: {
    wiki_tag?: string // for wiki conversations
    ai_proactive?: boolean // default based on participants
  }
}
```

**Human chat** → Conversation with human participants  
**AI chat** → Conversation with AI participants  
**Wiki tag page** → Special conversation where `[[tag]]` resolves to

### OpenAI-Compatible API

```javascript
// Standard OpenAI format
POST /v1/chat/completions
{
  "messages": [
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"}
  ],
  "conversation_id": "conv_abc123" // extension
}

// Collaborative extensions
PUT /v1/messages/{message_id}
{
  "content": "Updated message content",
  "edit_session_id": "edit_xyz" // for conflict resolution
}

// Conversation management
POST /v1/conversations
GET /v1/conversations/{id}/messages
POST /v1/conversations/{id}/participants
```

## User Experience

### For Everyone (Clean & Simple)
```
💬 Hey mom, planning dinner for [[Sunday family gathering]]

👵 What about that [[pasta recipe]] we tried last month?

🤖 @ai I can suggest wine pairings for pasta dishes!

💬 Perfect! Something that goes with [[marinara sauce]]
```

### For Developers (Powerful & Hackable)
```
💬 Debugging this [[React hydration]] issue

👩‍💻 Check the [[SSR setup]] - might be [[client-server mismatch]]

💬 @ai analyze this error: [pastes stack trace]

🤖 This looks like [[hydration mismatch]]. The issue is...

👩‍💻 /export conversation --format=markdown
> Exported to react-hydration-debug.md
```

### Interface Design

#### Chat Interface
- **Clean message bubbles** (Signal-style)
- **Click any message to edit** with collaborative cursors
- **`[[Tag]]` highlighting** and auto-completion
- **AI participants** with distinct visual styling
- **Smooth, fast animations**

#### AI Integration
- **Tag for help**: `@ai` brings AI into conversation
- **Proactive mode**: Toggle for AI to suggest/help automatically
  - Default OFF for human chats
  - Default ON for AI-only chats  
- **Multiple models**: Choose Claude, GPT, local models
- **Streaming responses**: Text appears as generated

#### Wiki System
- **`[[concept]]` creates links** to wiki conversations
- **Auto-completion** from existing tags
- **Wiki pages are conversations** with definition + tagged content
- **Cross-conversation search** finds all tagged content

## Technical Implementation

### Data Model
```sql
-- Core tables
conversations (id, type, title, created_at, metadata_json)
participants (conversation_id, participant_id, type, joined_at)
messages (id, conversation_id, author_id, content, created_at, edited_at)

-- Wiki system  
wiki_tags (tag_name, conversation_id, created_at)
message_tags (message_id, tag_name, start_pos, end_pos)

-- Collaborative editing (internal)
edit_sessions (id, message_id, user_id, started_at)
edit_deltas (session_id, delta_json, timestamp)
```

### Collaborative Editing (Invisible to User)
**User Experience**: Click any message → edit with live cursors  
**Implementation**: 
- New messages: Simple append-only 
- Edited messages: Automatically upgraded to operational transform
- Conflict resolution via edit sessions and deltas
- User never sees the technical complexity

### Wiki Tags as Conversations
When user types `[[machine learning]]`:
1. System creates/finds conversation with type='wiki_tag'
2. First message: Tag definition (editable)
3. Subsequent messages: Auto-populated from tagged content
4. Cross-conversation links work seamlessly

### Backend Stack
- **API Server**: Python + FastAPI (OpenAI-compatible, automatic docs)
- **Real-time**: WebSocket for everything (collaborative editing + AI streaming)
- **Database**: PostgreSQL with asyncpg/SQLAlchemy
- **AI Integration**: Server receives SSE from providers, forwards over WebSocket
- **Text Processing**: Native Python for `[[tag]]` parsing and search

### Frontend Stack (Mobile-First)
- **Cross-platform**: React Native (iOS/Android/Web from single codebase)
- **Styling**: NativeWind (TailwindCSS for React Native)
- **Real-time**: Single WebSocket connection
- **Types**: Generated TypeScript from Pydantic models

## Implementation Plan

### Phase 1: Core Chat (3 weeks)
- OpenAI-compatible API structure
- Basic conversation CRUD
- Clean messaging UI (Signal-style)
- Real-time message sync

### Phase 2: Collaborative Editing (2 weeks)  
- Message editing with conflict resolution
- Live cursors and presence
- Edit session management
- Invisible OT implementation

### Phase 3: AI Integration (2 weeks)
- AI participants in conversations
- `@ai` tagging and proactive modes
- Multiple model support
- Streaming response UI

### Phase 4: Wiki System (2 weeks)
- `[[tag]]` parsing and auto-completion
- Wiki conversations with auto-population
- Cross-conversation tag search
- Tag-based navigation

### Phase 5: Polish & Export (1 week)
- Keyboard shortcuts and command palette
- Export to Markdown/plain text
- Performance optimization
- Documentation and examples

## Key Design Decisions

### AI Behavior
- **Explicit invocation**: `@ai` tag or proactive mode toggle
- **Context-aware**: AI sees full conversation history
- **Mode defaults**: OFF for human chats, ON for AI chats
- **Same conversation model**: AI participants work like humans

### Wiki Tags  
- **Case-insensitive**: `[[Machine Learning]]` = `[[machine learning]]`
- **Auto-completion**: Type `[[` for suggestions
- **Conversations not files**: Wiki pages are just special conversations
- **Cross-linking**: Tags work across all conversation types

### Collaborative Editing
- **Invisible complexity**: Users just "click to edit"
- **Hybrid approach**: Append-only + OT as needed
- **Live cursors**: See who's editing what
- **Conflict resolution**: Automatic, no user intervention

### Data Export
- **Markdown format**: Conversations → `.md` files
- **Plain text backup**: Full database export
- **No lock-in**: Standard formats only
- **API access**: Everything scriptable

## Success Metrics

### Delight (Messaging App Feel)
- Time to first message: <10 seconds
- Message send latency: <100ms  
- UI responsiveness: 60fps animations
- Zero learning curve: Intuitive from first use

### Power (Developer Tool Feel)
- Keyboard efficiency: 90% of actions via shortcuts
- API adoption: >20% of users try export/scripting
- Knowledge building: >10 `[[concepts]]` per active user
- Cross-conversation linking: >50% of tags used multiple places

## Why This Will Work

### Unified Abstraction
- **Everything is a conversation** eliminates conceptual complexity
- **OpenAI compatibility** provides familiar API patterns  
- **Progressive disclosure** keeps surface simple, depths accessible

### Natural Knowledge Building
- **Tags emerge from conversation** instead of forced categorization
- **Wiki pages auto-populate** from tagged content across chats
- **Search works everywhere** because everything is searchable text

### Invisible Collaboration
- **No "collaboration features"** - just click any message to edit
- **Live cursors feel magical** but require no setup or modes
- **Conflict resolution is automatic** - users never deal with merge conflicts

---

## Architecture Benefits

### Python Backend Advantages
- **FastAPI**: Async performance with automatic OpenAPI documentation
- **Text Processing**: Native Python for parsing `[[tags]]` and search
- **AI Ecosystem**: Easy integration with transformers, embeddings if needed
- **WebSocket Support**: Built-in via FastAPI or python-socketio
- **Type Safety**: Pydantic models generate TypeScript types

### React Native Frontend
- **Single Codebase**: iOS, Android, and web from same React components
- **Native Performance**: True native apps, not webviews
- **Familiar**: Standard React patterns and ecosystem
- **WebSocket**: Reliable real-time communication across platforms

### Unified WebSocket Protocol
- **Single Connection**: Chat, collaboration, and AI streaming
- **Google Docs Proven**: WebSockets work for real-time collaboration at scale
- **Mobile Friendly**: Reliable on mobile networks
- **Simple Client**: No multiple protocol complexity

## Future Enhancements
- Plugin system for custom AI models
- Server-side semantic search with embeddings
- Integration APIs (import from other tools)
- Advanced search (date ranges, semantic similarity)
- Team/workspace organization

## References
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Signal Messenger UX](https://signal.org/)
- [Logseq Block-based Knowledge](https://logseq.com/)
- [Claude Code Developer Experience](https://claude.ai/code)