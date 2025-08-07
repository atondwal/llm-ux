# Codebase Cleanup Plan

## Current State Analysis

### Frontend Files to Remove
- `AppLive.tsx` - Old version without Yjs, superseded by AppLiveWithYjs
- `AppWithBackend.tsx` - Unused attempt at different architecture
- `src/hooks/useBackend.ts` - Only used by AppWithBackend
- `src/components/ChatInterface.tsx` - Only used by AppWithBackend
- `src/api-client/*` - Auto-generated but not actually used

### Frontend Files to Keep & Refactor
- `App.tsx` - Main app with navigation
- `AppLiveWithYjs.tsx` - Should rename to `ChatView.tsx` or similar
- `src/screens/WikiPage.tsx` - Wiki page view
- `src/components/CollaborativeEditor.tsx` - Used for Doc View
- `src/components/WikiText.tsx` - Wiki tag rendering
- `src/utils/wikiTagParser.ts` - Wiki tag parsing

### Backend Needs
- `src/main.py` is 700+ lines - needs to be split up:
  - `routes/conversations.py` - Conversation CRUD
  - `routes/messages.py` - Message operations
  - `routes/leaves.py` - Branching/versioning
  - `routes/websocket.py` - WebSocket handlers
  - `routes/wiki.py` - Wiki endpoints
  - `managers/connection.py` - ConnectionManager class
  - `storage.py` - In-memory storage (to be replaced with DB)

## Cleanup Steps

1. **Remove unused frontend files**
2. **Rename and reorganize frontend components**
3. **Split backend into modules**
4. **Update imports and tests**
5. **Remove dead code and unused dependencies**
6. **Update documentation**

## Dependencies to Remove
- Some Yjs code in places it shouldn't be
- Unused API client generation
- Dead test files

## New Structure

```
frontend/
  App.tsx                    # Main app with navigation
  src/
    views/
      ChatView.tsx          # Main chat interface (renamed from AppLiveWithYjs)
      WikiPage.tsx          # Wiki page view
      DocView.tsx           # Document collaborative view
    components/
      WikiText.tsx          # Wiki tag rendering
      CollaborativeEditor.tsx
    utils/
      wikiTagParser.ts

backend/
  src/
    main.py                 # FastAPI app setup only
    models/
      conversation.py
      branching.py
      websocket.py
    routes/
      conversations.py
      messages.py
      leaves.py
      websocket.py
      wiki.py
    managers/
      connection.py
      storage.py
```