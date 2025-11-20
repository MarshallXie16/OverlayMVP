# Project Memory - Workflow Automation Platform

## Project Overview
Building a Chrome Extension + Web Dashboard + API server for recording, managing, and executing interactive workflows with AI-powered step labeling and auto-healing capabilities.

**Target Users**: Teams managing repetitive web-based workflows (e.g., invoice processing, data entry, onboarding tasks)

**Core Value Proposition**: Record once, guide forever - with AI that adapts when UIs change

---

## Project Structure

```
workflow-platform/
├── extension/                  # Chrome extension (TypeScript + React)
│   ├── src/
│   │   ├── content/            # Content scripts (recorder, walkthrough)
│   │   ├── background/         # Background service worker
│   │   ├── popup/              # Popup UI components
│   │   ├── shared/             # Shared types and utilities
│   │   └── manifest.json       # Chrome extension manifest v3
│   └── package.json
│
├── backend/                    # FastAPI server (Python 3.11+)
│   ├── app/
│   │   ├── main.py             # FastAPI app entry
│   │   ├── api/                # API route handlers
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic validation schemas
│   │   ├── services/           # Business logic layer
│   │   ├── tasks/              # Celery background tasks
│   │   ├── db/                 # Database session, migrations
│   │   └── utils/              # Helper functions
│   ├── app.db                  # SQLite database (gitignored)
│   └── requirements.txt
│
├── dashboard/                  # React web app (TypeScript)
│   ├── src/
│   │   ├── pages/              # Page components
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── api/                # API client
│   │   └── store/              # Zustand state management
│   └── package.json
│
├── design_docs/                # User-provided specifications
│   ├── business_plan.md
│   ├── product_design.md
│   ├── technical_requirements.md
│   ├── roadmap.md
│   └── user_stories.md
│
├── .claude/                    # Agent configuration
│   └── CLAUDE.md               # Agent operating instructions
│
├── .env.example                # Environment variable template
├── .gitignore
└── package.json                # Monorepo workspace config
```

---

## Technology Stack

### Frontend
- **React 18** - UI components
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Vite** - Build tool

### Backend
- **FastAPI** - Python web framework
- **SQLAlchemy** - ORM
- **Pydantic** - Data validation
- **SQLite** - Database (MVP, will migrate to PostgreSQL)
- **Celery + Redis** - Background job queue
- **Anthropic Claude 3.5 Sonnet** - AI vision for labeling
- **AWS S3** - Screenshot storage

### Authentication
- JWT tokens (7-day expiration)
- Bcrypt password hashing
- Email + password (MVP)

---

## Key Architectural Decisions

### 1. Monorepo Structure
**Decision**: Single repository with workspace packages
**Rationale**: Shared types between extension/dashboard, easier coordination, simplified deployment
**Trade-off**: More complex build setup vs multiple repos

### 2. SQLite for MVP
**Decision**: Use SQLite instead of PostgreSQL initially
**Rationale**: Zero configuration, file-based, sufficient for <500 companies
**Migration Path**: SQLAlchemy makes switching to PostgreSQL seamless when needed (~500 companies)

### 3. Chrome Extension Manifest V3
**Decision**: Build with Manifest V3 (not V2)
**Rationale**: Required for Chrome Web Store, V2 being phased out
**Impact**: Service workers instead of background pages, different permission model

### 4. Celery for Background Jobs
**Decision**: Use Celery + Redis for AI labeling tasks
**Rationale**: Python standard, handles retries, rate limiting for AI API calls
**Alternative Considered**: FastAPI BackgroundTasks (too simple for our needs)

---

## Database Schema Overview

### Core Tables
- **companies** - Multi-tenant root (each company isolated)
- **users** - Team members (admin vs regular roles)
- **workflows** - Recorded workflow metadata
- **steps** - Individual workflow steps with selectors, metadata
- **screenshots** - Deduplicated screenshot storage (SHA-256 hash)
- **health_logs** - Execution tracking, success/failure rates
- **notifications** - Admin alerts for broken workflows

### Key Relationships
- Company → Users (one-to-many)
- Company → Workflows (one-to-many)
- Workflow → Steps (one-to-many, ordered by step_number)
- Workflow → Screenshots (one-to-many)
- Step → Screenshot (many-to-one, nullable)
- Workflow → Health Logs (one-to-many)

### Multi-tenancy Pattern
All queries must filter by `company_id` from JWT token to ensure data isolation.

---

## API Design Patterns

### RESTful Conventions
```
GET    /workflows          - List workflows
POST   /workflows          - Create workflow
GET    /workflows/:id      - Get single workflow
PUT    /workflows/:id      - Update workflow
DELETE /workflows/:id      - Delete workflow
```

### Response Format
```json
{
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}

// Errors
{
  "error": {
    "code": "WORKFLOW_NOT_FOUND",
    "message": "Workflow with id 'abc123' not found"
  }
}
```

### Authentication
- All endpoints except `/auth/signup` and `/auth/login` require JWT
- Header: `Authorization: Bearer {token}`
- Token contains: `user_id`, `company_id`, `role`

---

## Development Workflow

### 1. Starting the Dev Environment
```bash
# Terminal 1: Backend API
cd backend
source venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2: Celery Worker (when needed)
cd backend
celery -A app.tasks worker --loglevel=info

# Terminal 3: Dashboard
cd dashboard
npm run dev

# Terminal 4: Extension
cd extension
npm run dev
# Then load unpacked extension from dist/ folder in Chrome
```

### 2. Code Quality Checks
- Python: Use Black for formatting, Ruff for linting (post-MVP)
- TypeScript: ESLint + Prettier (to be configured)
- Run tests before committing significant changes

### 3. Git Workflow
- Feature branches: `feature/TICKET-XXX-description`
- Commit after each working unit
- Clear commit messages: `[TICKET-XXX] Brief description`

---

## Environment Variables

Required variables (see `.env.example`):
- `DATABASE_URL` - SQLite connection string
- `JWT_SECRET_KEY` - For token signing
- `ANTHROPIC_API_KEY` - Claude API key
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - S3 credentials
- `S3_BUCKET_NAME` - Screenshot storage bucket
- `REDIS_URL` - Celery message broker

---

## Lessons Learned

### Project Setup Phase
- **Date**: 2025-11-19
- **Lesson**: Start with comprehensive .gitignore to avoid committing secrets/databases
- **Action**: Created .gitignore before any code

### Extension Development (FE-002)
- **Date**: 2025-11-20
- **Lesson**: Chrome extension testing requires mocking chrome APIs carefully
- **Solution**: Created comprehensive test setup with Vitest + happy-dom, mocked chrome.storage/runtime/tabs APIs
- **Lesson**: TypeScript types should match backend Pydantic schemas exactly (field names, optionality, types)
- **Action**: Created `types.ts` with all backend schemas; use ISO 8601 strings for datetimes (not Date objects)
- **Lesson**: API client needs robust retry logic for network failures, but NOT for client errors (4xx)
- **Implementation**: Exponential backoff for 5xx/network errors, immediate failure for 4xx
- **Lesson**: Token expiration should be checked on every `getToken()` call, not just on auth
- **Implementation**: `getToken()` automatically clears expired tokens before returning null
- **Test Coverage**: 39 tests (21 storage + 18 API client), 100% passing

### Extension Core Features (FE-003, FE-004, FE-005)
- **Date**: 2025-11-20
- **Lesson**: Parallel subagent implementation works well for large features (3 features, 16 SP, ~3000 lines)
- **Approach**: Launched 3 specialized agents with clear specs, consolidated and tested integration
- **Lesson**: Background service workers must be stateless (Manifest V3 limitation)
- **Solution**: Persist all state to chrome.storage, design for interrupted recordings
- **Lesson**: Content scripts should use capture phase listeners for reliable event interception
- **Implementation**: `addEventListener(..., true)` to catch events before page handlers
- **Lesson**: Dynamic framework IDs (React `:r[0-9]+:`, MUI, Ember) must be filtered out
- **Solution**: Pattern matching to reject unstable selectors, fall back to CSS/XPath
- **Lesson**: IndexedDB better than chrome.storage for buffering recorded steps (no 5MB limit)
- **Implementation**: Created indexeddb.ts wrapper with proper error handling
- **Lesson**: Zustand works great for extension popup state management (simpler than Redux)
- **Implementation**: Created authStore and recordingStore with clean actions
- **Lesson**: TypeScript test paths must be excluded from build (tsconfig exclude)
- **Fix**: Added `src/test/**/*` and `**/*.test.ts` to tsconfig exclude
- **Integration**: All components wire together correctly, build succeeds, no TypeScript errors

---

## Code Patterns & Conventions

### Naming Conventions
- **Files**: snake_case for Python, kebab-case for TypeScript/React
- **Components**: PascalCase for React components
- **Functions**: camelCase for TypeScript, snake_case for Python
- **Constants**: UPPER_SNAKE_CASE

### Error Handling Pattern
```python
# Backend (FastAPI)
from fastapi import HTTPException

if not workflow:
    raise HTTPException(
        status_code=404,
        detail={
            "code": "WORKFLOW_NOT_FOUND",
            "message": f"Workflow with id '{workflow_id}' not found"
        }
    )
```

### Type Safety Pattern
```typescript
// Extension/Dashboard (TypeScript)
interface Step {
  step_number: number;
  action_type: 'click' | 'input_commit' | 'select_change' | 'submit' | 'navigate';
  selectors: Selectors;
  element_meta: ElementMeta;
  // ... more fields
}
```

---

## Critical Dependencies

### Backend
- `fastapi` - Web framework
- `sqlalchemy` - ORM
- `anthropic` - AI vision API
- `celery` - Background jobs
- `boto3` - AWS S3 client

### Frontend (Extension + Dashboard)
- `react` - UI framework
- `zustand` - State management
- `vite` - Build tool

---

## Security Considerations

### Implemented
- HTTPS only (enforced in production)
- JWT token expiration (7 days)
- Bcrypt password hashing (cost 12)
- CORS configuration
- SQL injection prevention (SQLAlchemy parameterized queries)

### Not Yet Implemented (Post-MVP)
- Rate limiting
- CSRF tokens
- Advanced threat detection

---

## Performance Considerations

### Current Optimizations
- Screenshot deduplication via SHA-256 hashing
- Database indexes on foreign keys
- Concurrent AI processing (max 5 parallel requests)

### Future Optimizations (when needed)
- Redis caching for frequently-read workflows
- Database query optimization
- CDN for screenshot delivery
- Aggressive image compression

---

## Next Steps

See `tasks.md` for current sprint plan and `roadmap.md` for long-term milestones.
