# Project Memory - Workflow Automation Platform

## Project Overview
Building a Chrome Extension + Web Dashboard + API server for recording, managing, and executing interactive workflows with AI-powered step labeling and auto-healing capabilities.

**Target Users**: Teams managing repetitive web-based workflows (e.g., invoice processing, data entry, onboarding tasks)

**Core Value Proposition**: Record once, guide forever - with AI that adapts when UIs change

---

## Recent Work Summary

### Workflow Recording System (Nov 2024)
**Objective:** Fix workflow recording to capture clean, semantic user actions instead of noisy DOM events.

**What We Built:**
- EventDeduplicator system with 100ms buffering and priority-based selection
- Fixed race condition in step numbering (atomic increment)
- Implemented value change detection for inputs
- Organized codebase (tests to `__tests__/`, CSS to `styles/`, docs to `docs/`)

**Impact:** Reduced login workflow from 13 steps → 4 steps (69% reduction)

**Status:** ✅ Complete and tested

---

## Key Lessons Learned

### 1. Event Deduplication is Critical
**Problem:** Clicking a checkbox label fires 3 events (label click, input click, change).  
**Lesson:** Buffer events and pick the most semantic one using priority system.  
**Implementation:** 100ms buffer + priority hierarchy (submit > change > input_commit > click)

### 2. Race Conditions in Async JavaScript
**Problem:** Multiple event handlers reading same step counter → duplicate step numbers → database constraint violation.  
**Lesson:** Capture atomically with `const stepNumber = ++state.counter` instead of incrementing then reading.  
**Prevention:** Always capture state immediately, never rely on it being unchanged after async operations.

### 3. Value Change Detection
**Problem:** Recording every blur event creates noise (empty clicks, autofill spam).  
**Lesson:** Track values on focus, only record on blur if value actually changed.  
**Benefit:** Eliminates 60-70% of unnecessary input steps.

### 4. Chrome Extension CSS Loading
**Problem:** TypeScript imports of CSS don't work in content scripts.  
**Lesson:** Must load CSS via manifest.json `content_scripts.css` array.  
**Prevention:** Never import CSS in content script TypeScript files.

### 5. Database Constraints as Bug Detectors
**Problem:** Duplicate step numbers were silently created until database rejected them.  
**Lesson:** Unique constraints catch bugs that tests might miss.  
**Practice:** Design database schema to enforce business rules (e.g., unique step numbers per workflow).

### 6. Codebase Organization
**Problem:** Tests mixed with source, CSS mixed with TypeScript, verbose docs at root.  
**Lesson:** Standard conventions matter (`__tests__/` for tests, `docs/` for documentation, `styles/` for CSS).  
**Benefit:** Easier navigation for humans and AI agents.

### 7. Error Logging for Debugging
**Problem:** Generic "Request failed" errors without details.  
**Lesson:** Log full error objects, especially for backend validation errors.  
**Implementation:** Parse and display FastAPI/Pydantic validation error details.

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

### Dashboard Implementation (FE-006, FE-007)
- **Date**: 2025-11-20
- **Lesson**: Vite requires explicit type definitions for `import.meta.env`
- **Solution**: Created `vite-env.d.ts` with `ImportMetaEnv` interface
- **Lesson**: `HeadersInit` type doesn't support bracket notation in TypeScript strict mode
- **Solution**: Use `Record<string, string>` for headers, then pass to RequestInit
- **Lesson**: API client pattern reusable between extension and dashboard
- **Implementation**: Similar retry logic, token management, error handling
- **Lesson**: Form validation should be pure functions returning `{ isValid, error }`
- **Pattern**: Separate validators for email, password, name, confirmation
- **Lesson**: Protected routes need loading states during auth check
- **Implementation**: ProtectedRoute shows spinner while checkAuth() runs
- **Lesson**: Zustand store pattern consistent across extension and dashboard
- **Implementation**: Same action-based API, clear separation of concerns
- **Test Coverage**: 15 tests for validation utilities (100% passing)
- **Build**: Production build succeeds (191 KB JS, 14 KB CSS)
- **Files Created**: 18 new files (~1,800 lines of code)

### Testing & Build Issues (Post-MVP Implementation)
- **Date**: 2025-11-21
- **Lesson**: **Build dependencies MUST be in package.json when using them in vite config**
- **Issue**: Used `vite-plugin-static-copy` in vite.config.ts but forgot to add to devDependencies
- **Consequence**: Extension dist/ missing manifest.json, overlay.css - Chrome rejected extension
- **Solution**: Add `vite-plugin-static-copy` to extension/package.json, configure to copy all static files
- **Prevention**: Pre-commit checklist to verify new imports have corresponding dependencies
- **Lesson**: **FastAPI dependency injection must respect test overrides**
- **Issue**: `get_current_user()` had `db: Session = Depends(lambda: None)` then manually created session with `next(get_db())`
- **Consequence**: Test database overrides ignored, causing "User not found" errors in tests
- **Solution**: Changed to `db: Session = Depends(get_db)` to properly use dependency injection
- **Prevention**: Always use `Depends(get_db)` pattern, never manually call `next(get_db())`
- **Lesson**: **Test coverage gaps allow bugs to slip through**
- **Issue**: Only 39 tests (mostly shared utilities), zero API endpoint tests, no content script tests
- **Consequence**: Build failures and API issues not caught until manual testing
- **Solution**: Added 11 backend API tests (auth endpoints), improved extension tests to 48 total
- **Test Coverage Now**: Extension 48 tests, Backend 11 tests (all passing)
- **Lesson**: **TDD prevents manual testing cycles**
- **Action**: Created PRE_COMMIT_CHECKLIST.md with comprehensive testing steps
- **Pattern**: Run `npm test` and `pytest` before every commit
- **Key Files**:
  - `/home/user/OverlayMVP/backend/tests/test_api_auth.py` - Auth endpoint tests
  - `/home/user/OverlayMVP/extension/src/content/utils/selectors.test.ts` - Selector extraction tests
  - `/home/user/OverlayMVP/PRE_COMMIT_CHECKLIST.md` - Pre-commit verification steps

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

## Workflow Recording Implementation (Sprint 1 - Complete)

### Architecture Overview

The workflow recording system consists of three integrated components:

```
User Action → Content Script (Recorder) → IndexedDB (Buffer) → Background Worker → API Server
                    ↓
              Visual Feedback
              Recording Widget
```

### Key Components

#### 1. Content Script Recorder (`extension/src/content/recorder.ts`)
- **Purpose**: Captures user interactions in real-time during workflow recording
- **Events Captured**: clicks, inputs (blur), selects (change), form submissions, navigation
- **Filtering**: Uses `isInteractionMeaningful()` to filter noise (non-interactive elements, framework IDs)
- **Storage**: Buffers steps in IndexedDB with screenshot blobs
- **Visual Feedback**: Flashes captured elements with CSS animation (300ms)
- **Widget**: Shows floating recording widget with step counter and stop/pause buttons

#### 2. IndexedDB Storage (`extension/src/content/storage/indexeddb.ts`)
- **Database**: WorkflowRecorderDB (version 2)
- **Object Stores**:
  - `steps`: Stores step data (StepCreate objects)
  - `screenshots`: Stores screenshot blobs (keyed by step_number)
- **Purpose**: Buffers recorded data locally before upload (handles network issues, quota exceeded)
- **Cleanup**: Cleared after successful upload to backend

#### 3. Recording Widget (`extension/src/content/widget.ts`)
- **UI**: Floating widget (bottom-right, draggable)
- **Features**:
  - Pulsing red dot indicator
  - Real-time step counter ("5 steps")
  - Stop button (triggers upload)
  - Pause button (placeholder for future)
- **Styling**: Gradient purple background, glassmorphism effect, smooth animations
- **Position**: Fixed, z-index 999999 (non-intrusive but always visible)

#### 4. Visual Feedback (`extension/src/content/feedback.ts`)
- **Animation**: 300ms flash effect on captured elements
- **Effect**: Glowing blue outline that fades out
- **Purpose**: Immediate user feedback that action was recorded

#### 5. Background Worker Upload (`extension/src/background/messaging.ts`)
- **Flow**:
  1. Receives STOP_RECORDING message with steps + screenshots (as dataUrls)
  2. Creates workflow via API (returns workflow_id)
  3. Uploads screenshots asynchronously with workflow_id
  4. Returns success to content script
  5. Content script clears IndexedDB
- **Error Handling**: Screenshots upload in background; failure doesn't block workflow creation

#### 6. API Client Retry Logic (`extension/src/shared/api.ts`)
- **Retries**: Up to 3 attempts
- **Backoff**: Exponential (1s, 2s, 4s)
- **Retryable**: Server errors (5xx), network errors, timeouts
- **Non-Retryable**: Auth errors (401, 403), client errors (4xx)
- **Already Implemented**: No changes needed

### Data Flow: Recording to Upload

```
1. User clicks "Start Recording" in extension popup
   ↓
2. Background worker sends START_RECORDING to content script
   ↓
3. Content script (recorder.ts):
   - Clears IndexedDB (steps + screenshots)
   - Shows recording widget
   - Attaches event listeners
   ↓
4. User performs actions on page
   ↓
5. For each meaningful interaction:
   - Extract selectors + metadata
   - Capture screenshot (background worker)
   - Store step in IndexedDB.steps
   - Store screenshot blob in IndexedDB.screenshots
   - Flash element (visual feedback)
   - Update widget step counter
   ↓
6. User clicks "Stop" in widget or popup
   ↓
7. Content script (recorder.ts):
   - Hides widget
   - Retrieves all steps from IndexedDB
   - Retrieves all screenshots from IndexedDB
   - Converts screenshot blobs → dataUrls (for message passing)
   - Sends STOP_RECORDING message to background
   ↓
8. Background worker (messaging.ts):
   - Creates workflow via API (steps with screenshot_id=null)
   - Gets workflow_id from response
   - Uploads screenshots async with workflow_id
   - Cleans up recording state
   - Returns success
   ↓
9. Content script:
   - Clears IndexedDB (steps + screenshots)
   - Recording complete!
   ↓
10. Backend:
    - Workflow status="processing"
    - AI labeling job queued (future sprint)
    - Screenshots stored in S3 (companies/{id}/workflows/{id}/screenshots/{id}.jpg)
```

### Screenshot Handling

**Why not upload during recording?**
- API requires workflow_id (chicken-and-egg problem)
- User shouldn't wait for uploads during recording

**Solution:**
1. Capture screenshots as blobs, store in IndexedDB
2. Create workflow first (get workflow_id)
3. Upload screenshots with workflow_id after workflow creation

**Deduplication:**
- Backend calculates SHA-256 hash of each screenshot
- Identical screenshots stored once, referenced multiple times
- Saves storage space and upload time

### Testing

**Extension Tests** (68 total):
- Widget tests (12): UI creation, show/hide, step counter, button callbacks
- Feedback tests (8): Flash animation, timing, multiple elements
- Selector tests (9): Dynamic ID filtering, stable attribute extraction
- Storage tests (21): IndexedDB operations, quota handling
- API client tests (18): Retry logic, error handling, authentication

**Backend Tests** (108+ total):
- Workflow API tests: CRUD, multi-tenancy, pagination
- Screenshot API tests: Upload, deduplication, presigned URLs
- Auth API tests: Signup, login, JWT validation

### Known Limitations & Future Improvements

**Current MVP Limitations:**
- Pause functionality not implemented (UI shows placeholder)
- No retry UI if upload fails (background logs error)
- Screenshots uploaded sequentially (could parallelize in batches)
- No progress indicator for screenshot uploads

**Planned Enhancements (Post-MVP):**
- Screenshot upload progress bar in widget
- Retry mechanism with user notification
- Batch screenshot upload (5 at a time)
- Pause/resume recording
- Edit recording before upload (delete unwanted steps)

### Code Files Changed/Added

**New Files:**
- `extension/src/content/widget.ts` - Recording widget UI
- `extension/src/content/widget.css` - Widget styling
- `extension/src/content/feedback.ts` - Visual feedback module
- `extension/src/content/feedback.css` - Flash animation
- `extension/src/content/widget.test.ts` - Widget tests
- `extension/src/content/feedback.test.ts` - Feedback tests

**Modified Files:**
- `extension/src/content/recorder.ts` - Integrated widget, feedback, screenshot storage
- `extension/src/content/storage/indexeddb.ts` - Added screenshots object store
- `extension/src/background/messaging.ts` - Screenshot upload logic
- `extension/src/shared/api.ts` - Fixed form field name (image vs file)
- `extension/vite.config.ts` - Copy widget.css and feedback.css
- `dashboard/src/pages/Dashboard.tsx` - Enhanced empty state with instructions
- `backend/app/api/screenshots.py` - (No changes, already correct)

### Lessons Learned

**Build Configuration:**
- Always add new CSS files to vite-plugin-static-copy targets
- Static imports (import './widget.css') bundle into JS, explicit copy needed for debugging

**IndexedDB:**
- Supports Blob storage natively (no serialization needed)
- Version bumps required for schema changes
- Separate object stores cleaner than nested data structures

**Chrome Extension Messaging:**
- Can't send Blobs via runtime.sendMessage (uses JSON)
- Convert Blob → dataUrl for message passing, then back to Blob for upload
- Background worker can access content script data only via messages

**Testing:**
- Visual components need real DOM (happy-dom works great)
- Async timers (setTimeout) need proper awaits in tests
- Mock callbacks with vi.fn() for event testing

---

## Next Steps

See `tasks.md` for current sprint plan and `roadmap.md` for long-term milestones.
