# Claude Code Context & Progress Notes

## Current Status (2025-08-07)

### What We've Built
1. **Python Backend (100% Complete)**
   - FastAPI with OpenAI-compatible API
   - 100% test coverage with pytest
   - Strict mypy type checking passing
   - Core conversation CRUD operations
   - In-memory storage (ready for PostgreSQL)
   - Location: `/backend`

2. **React Native Frontend (In Progress)**
   - TypeScript with strictest settings
   - Jest testing configured
   - ChatInterface component partially working (4/12 tests passing)
   - Location: `/frontend`

### Extreme TDD Approach
- **ALWAYS write tests FIRST** (Red phase)
- **Then minimal implementation** (Green phase)  
- **100% coverage requirement** (no exceptions)
- Backend achieved this ✅
- Frontend in progress (33% tests passing)

### Key Commands

#### Backend
```bash
cd backend
source .venv/bin/activate
make test        # Run tests (must be 100% coverage)
make type-check  # Run mypy strict
make dev         # Run dev server
```

#### Frontend  
```bash
cd frontend
npm test         # Run tests
npm run type-check  # TypeScript check
```

### Current Challenges
1. **React Native Testing**: Complex setup with jest-expo, had to create manual mocks
2. **Test Environment**: Using node environment with mocked React Native components
3. **Remaining Tests**: 8 tests failing in ChatInterface (send button, wiki tags, editing, AI features)

### Architecture Decisions
- **Everything is a conversation** (chat, wiki pages, all use same model)
- **OpenAI-compatible API** for familiarity
- **WebSockets for real-time** (not SSE)
- **Python backend** (your preference over Node.js)
- **React Native** for cross-platform mobile

### Next Steps
1. Fix remaining 8 failing tests in ChatInterface
2. Implement WebSocket connection between frontend/backend
3. Add collaborative editing with Yjs
4. Implement wiki tag system
5. Add PostgreSQL persistence
6. Implement real AI integration (OpenAI/Anthropic)

### Design Philosophy
- **Signal/Messenger UX** - Clean, minimal, fast
- **Claude Code power** - Hackable, extensible
- **Wiki tags** like LessWrong `[[concept]]`
- **Collaborative** like Google Docs
- **NOT enterprise** - Personal/small team focus

### Important Files
- `/design-doc.md` - Full system design
- `/CODING_STANDARDS.md` - Extreme TDD requirements
- `/backend/src/main.py` - Core API
- `/backend/tests/` - 100% coverage tests
- `/frontend/src/components/__tests__/ChatInterface.test.tsx` - Test-first frontend

### Git Status
- Repository: https://github.com/atondwal/llm-ux
- All code committed and pushed
- Following commit standards (test, feat, refactor prefixes)

### Environment Notes
- Using `uv` for Python package management
- React Native with Expo
- Jest with manual React Native mocks
- TypeScript in strict mode everywhere

## Key Insight for Next Session
The main challenge is React Native testing complexity. Consider either:
1. Continuing with manual mocks (current approach)
2. Switching to React Web first (simpler testing)
3. Using a different test strategy (e2e with Detox?)

The backend is SOLID with 100% coverage. Frontend needs test fixes to continue TDD properly.

## Remember
- **Tests BEFORE implementation ALWAYS**
- **100% coverage or it doesn't ship**
- **Type safety everywhere**
- **Self-review after each commit**
- **Keep it simple and hackable**