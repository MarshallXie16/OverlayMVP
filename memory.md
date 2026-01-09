# Project Memory - Workflow Automation Platform

## Project Overview
Building a Chrome Extension + Web Dashboard + API server for recording, managing, and executing interactive workflows with AI-powered step labeling and auto-healing capabilities.

**Target Users**: Teams managing repetitive web-based workflows (e.g., invoice processing, data entry, onboarding tasks)

**Core Value Proposition**: Record once, guide forever - with AI that adapts when UIs change

---

## Current Status (Updated 2025-01-08)

### Feature Completion Matrix

| Epic | Feature | Status | Notes |
|------|---------|--------|-------|
| **1. Auth & Onboarding** | Company Signup | ✅ Complete | Full flow working |
| | Team Invite | ⚠️ 90% | Backend works, TeamView uses mock data |
| | Extension Install | ✅ Complete | Modal works, Chrome Web Store placeholder |
| **2. Workflow Recording** | Start Recording | ✅ Complete | Widget, step counter working |
| | Capture Actions | ✅ Complete | Deduplication, screenshots, filtering |
| | Stop & Upload | ⚠️ 95% | Works, no error UI or completion notification |
| **3. AI Review** | AI Labels | ✅ Complete | Claude Vision with tool calling |
| | Edit Steps | ✅ Complete | Modal with validation |
| | Delete Steps | ⚠️ 80% | Works, no confirmation modal |
| | Save Workflow | ✅ Complete | Status changes, validation |
| **4. Walkthrough** | Discover Workflows | ✅ Complete | Dashboard with health badges |
| | Start Walkthrough | ✅ Complete | Overlay UI, spotlight |
| | Complete Steps | ✅ Complete | Navigation, progress |
| | Validation | ⚠️ 70% | Basic works, no format validation |
| **5. Auto-Healing** | Element Detection | ✅ Complete | 5-factor scoring, AI validation |
| | Admin Alerts | ⚠️ 40% | Backend creates notifications, no UI |
| | Health Dashboard | ❌ Mock Data | HealthView uses fake data |
| **6. Settings** | Company Settings | ⚠️ 30% | TeamView incomplete |
| | Profile Settings | ❌ Not Started | No profile page |

### Test Status (2025-01-08) - Sprint 2 Complete

| Component | Total | Pass | Fail | Notes |
|-----------|-------|------|------|-------|
| Backend | 327 | 326 | 0 | 1 skipped (all passing) |
| Extension | 435 | 426 | 9 | Environment issues only (jsdom XPath, tag casing) |
| Dashboard | 41 | 41 | 0 | All passing |

**Sprint 2 Fixes Applied:**
- Backend: Fixed fixture names, model versions, status codes, timing
- Extension: Fixed positionSimilarity (effectiveDistance), attributeMatch (conditional factors)
- Added 25 new walkthrough tests (64 total)

### Critical Gaps

**Security (P0)**:
- SECURITY-001: XPath injection vulnerability
- SECURITY-002: XSS via innerHTML in walkthrough
- SECURITY-003: PostMessage spoofing (no origin check)
- SECURITY-004: No rate limiting on auth

**Core Features (P1)**:
- HealthView shows mock data, not real health metrics
- Notification bell UI doesn't exist
- Click validation bug (clicks on child elements fail)
- TeamView uses mock data

### SME Readiness: 6/10

Core value proposition works. Gaps are primarily in admin visibility (health dashboard, notifications) and UX polish (alerts vs toasts, missing confirmations).

See `docs/SME_VALUE_PROPOSITION.md` for detailed analysis.

---

## Recent Work Summary

### Sprint 4: Company & Team Management (2024-12-24)
**Objective:** Implement company management APIs, team invite flow, and dashboard team view.

**What We Built:**
- Company API endpoints (`/api/companies/me`, `/me/members`, `/invite/{token}`)
- Team member listing and removal (admin only)
- Invite token generation (UUID stored on company record)
- Public invite link verification endpoint
- Team management UI (TeamView page with mock data)
- Invite flow: Dashboard link → Signup with company join
- Extension installation modal with Chrome Web Store placeholder

**Current Status:**
- Backend: Company APIs complete and tested
- Frontend: TeamView works with real invite token display
- Flow: Invite → Signup → Join company works E2E
- Next: Full RBAC system (Admin > Editor > Viewer roles)

**Test Status (2025-12-24):**
- Backend: 238 passed, 14 failed, 5 errors (documented in backlog as TEST-FIX-001)
- Extension: 373 passed, 37 failed (documented in backlog as TEST-FIX-002)
- Dashboard: 28 passed (100%)

### Sprint 3: Walkthrough Mode Foundation (2025-11-24)
**Objective:** Implement foundation for walkthrough mode - health indicators, start button, messaging infrastructure, and element finding.

**What We Built:**
- Health status calculation and visual indicators (✓ Healthy, ⚠️ Needs Review, ❌ Broken)
- Workflow health sorting (broken workflows appear first)
- Health log execution endpoint with exponential moving average for success_rate
- "Start Walkthrough" button with extension detection
- Dashboard-to-extension communication bridge
- Background orchestrator for walkthrough messaging
- WalkthroughState management in content script
- Element finder with cascading selector fallback (primary → CSS → XPath → data-testid)
- MutationObserver-based waiting for dynamic content
- Comprehensive unit tests for health calculation and element finding

**Impact:**
- Users can now discover workflow health at a glance
- "Start Walkthrough" is one-click (no URL typing needed)
- Element finder provides robustness for UI changes (MVP for auto-healing)
- Health metrics automatically track workflow reliability

**Status:** ✅ 5/5 tickets complete - Foundation ready for overlay UI

### Sprint 2: AI-Powered Workflow Labeling (2024-11-23)
**Objective:** Implement complete AI labeling pipeline with Claude Vision API and admin review/edit interface.

**What We Built:**
- Celery + Redis task queue for background processing
- Claude Vision API integration with tool calling for structured JSON
- AI service with fallback templates and cost tracking
- Screenshot linking fix (extension → backend PATCH endpoint)
- Race condition fix (explicit processing trigger)
- Local file storage for screenshots (MVP, no S3 needed)
- Base64 conversion for local images (Claude HTTPS requirement)
- Admin review page with step cards and confidence indicators
- Edit modal with form validation and technical details
- Workflow activation validation
- Step update API with edit tracking

**Impact:** 
- AI generates smart labels: "Email Address" instead of "input"
- Cost: ~$0.03-0.05 per workflow (6 steps)
- Confidence: 0.70-0.95 for AI labels
- Saves 10-15 minutes of manual editing per workflow

**Status:** ✅ Complete - End-to-end AI labeling working!

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

### 8. Multi-Step Upload Flows Need Explicit Linking
**Problem:** Extension uploaded screenshots but AI never used them (always fell back to templates).  
**Root Cause:** Screenshots uploaded to backend but never associated with step records.  
**Lesson:** Multi-step workflows need explicit linking - don't assume backend will auto-associate.  
**Solution:** Added PATCH `/api/steps/{id}/screenshot` endpoint, extension calls after each upload.

### 9. Race Conditions in Async Workflows
**Problem:** Celery started AI processing before extension finished linking screenshots.  
**Symptom:** All steps processed with no screenshots, $0.00 AI cost, fallback labels.  
**Lesson:** Let client control async workflow timing when it has critical dependencies.  
**Solution:** Removed immediate Celery trigger, added explicit POST `/api/workflows/{id}/start-processing` that extension calls.

### 10. Reusable Component Pattern (Sprint 3)
**Context:** Needed health indicators on both Dashboard cards and WorkflowDetail page.  
**Lesson:** Extract components with variants (size, showLabel) instead of duplicating code.  
**Implementation:** `HealthBadge` component with small/large sizes, reusable across pages.  
**Benefit:** DRY principle, easier to maintain and extend.

### 11. Service Layer Separation (Sprint 3)
**Context:** Health logging has complex business logic (EMA calculation, threshold checks, status updates).  
**Lesson:** Separate business logic from API routes using service layer.  
**Implementation:** `health.py` service with `log_workflow_execution()` contains all logic, API route just validates and calls service.  
**Benefit:** Easier to test, reusable from different contexts (API, CLI, tests).

### 12. Extension Bridge Pattern (Sprint 3)
**Context:** Dashboard needs to communicate with Chrome extension.  
**Lesson:** Create utility module for extension communication instead of inline logic.  
**Implementation:** `extensionBridge.ts` with `isExtensionInstalled()`, `sendMessageToExtension()`, `startWalkthrough()`.  
**Benefit:** Error handling centralized, reusable across dashboard pages, easier to mock in tests.

### 13. Background as Orchestrator (Sprint 3)
**Context:** Need to coordinate between dashboard, API, and content script for walkthrough.  
**Lesson:** Background service worker should orchestrate complex flows, not content scripts.  
**Rationale:** Content scripts can't easily make authenticated API calls, background has more capabilities.  
**Pattern:** Dashboard → Background (message) → API (fetch) → Background → Content Script (message)  
**Benefit:** Clean separation of concerns, easier error handling.

### 14. Delay for Content Script Loading (Sprint 3)
**Problem:** Sending message immediately after opening tab fails because content script not loaded yet.  
**Lesson:** Add explicit delay (500ms-1s) after opening tab before sending messages.  
**Implementation:** `setTimeout(() => { chrome.tabs.sendMessage(...) }, 1000)`  
**Note:** This is a known Chrome extension pattern, not a hack.

### 15. Selector Fallback for Robustness (Sprint 3)
**Context:** Need to find elements even if UI changes slightly.  
**Lesson:** Try multiple selectors in priority order (stable → specific → generic).  
**Implementation:** Primary (ID) → CSS (path) → XPath → data-testid, skip if not interactable.  
**Benefit:** Works across UI changes, provides redundancy, prepares for Epic 5 auto-healing.

### 16. MutationObserver for Dynamic Content (Sprint 3)
**Context:** SPAs and lazy-loaded content may not have elements immediately.  
**Lesson:** Combine immediate find (fast path) with MutationObserver (dynamic content path).  
**Implementation:** Try querySelector first, if fails set up observer + polling, timeout after 5s.  
**Benefit:** Handles both static and dynamic content elegantly, better than polling alone.

### 17. Exponential Moving Average for Metrics (Sprint 3)
**Context:** Need to track workflow success_rate that balances historical and recent data.  
**Lesson:** Use EMA with α=0.1 (90% weight on history, 10% on new data).  
**Formula:** `new_rate = 0.9 * old_rate + 0.1 * (success ? 1.0 : 0.0)`  
**Benefit:** Smooth metric that responds to trends without being too sensitive to single failures.

### 18. Always Run Builds After Implementation (Sprint 3)
**Context:** TypeScript errors not caught until user tried to build extension.  
**Lesson:** Run `npm run build` after implementing features to catch compilation errors immediately.  
**Pattern:** After each ticket or significant change, run build command for affected packages.  
**Benefit:** Catches unused variables, type errors, undefined access early before commit.  
**Note:** Especially important for TypeScript projects with strict type checking.

### 19. AI SDK Major Version Upgrades
**Problem:** `'Anthropic' object has no attribute 'messages'` error.
**Root Cause:** Outdated anthropic package (0.7.1) had completely different API structure.
**Lesson:** AI SDKs have major breaking changes between versions - check docs carefully.
**Solution:** Upgraded to 0.74.1, changed all calls to `client.messages.create()`.

### 20. Claude Tool Calling vs Prompt Engineering
**Problem:** Claude returned plain text "Here's the JSON: {...}" instead of pure JSON.
**Initial Approach:** Tried regex to extract JSON from text (brittle).
**Lesson:** Use tool calling for guaranteed structured output, not prompt engineering.
**Solution:** Defined `record_workflow_labels` tool with explicit schema, forced tool use.

### 21. Local Development HTTPS Requirements
**Problem:** Claude API rejected local screenshot URLs: "Only HTTPS URLs supported".
**Workaround Considered:** Set up local HTTPS (complex).
**Lesson:** Convert local files to base64 for AI APIs with HTTPS requirements.
**Solution:** Read screenshot files, encode as base64, send in API request.

### 22. Mocked Storage Breaks Dependent Features
**Problem:** Screenshots showed as broken images in dashboard.
**Root Cause:** S3 utilities completely mocked, returned fake URLs, files never saved.
**Lesson:** MVP needs real storage implementation, even if local; mocks break integration.
**Solution:** Implemented local file storage with FastAPI StaticFiles serving.

### 23. UI Navigation Must Ship With Features
**Problem:** Review page existed but users couldn't find it (had to type URL manually).
**Root Cause:** Developer implemented page but forgot navigation button.
**Lesson:** ALWAYS add UI navigation in same commit as new page/feature.
**Solution:** Added "Review & Edit" button on workflow detail page.

### 24. Empty Response Bodies
**Problem:** DELETE workflow threw JSON parse error despite successful deletion.
**Root Cause:** 204 No Content returns empty body, client tried to parse JSON.
**Lesson:** Check response status and content-length before calling `.json()`.
**Solution:** Return `undefined` for 204 responses or empty bodies.

### 25. Dependency Type Assumptions
**Problem:** `TypeError: 'User' object is not subscriptable` when accessing `current_user["company_id"]`.
**Root Cause:** Assumed FastAPI dependency returned dict, but it returns User object.
**Lesson:** Verify what types dependencies actually return, don't assume.
**Solution:** Changed to `current_user.company_id` (attribute access).

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
  - `invite_token` - UUID for team invite links (generated on company creation)
- **users** - Team members (admin vs regular roles)
  - `role` - "admin" or "regular" (future: "editor", "viewer")
  - `company_id` - FK to companies (set on signup via invite or new company)
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

## AI Labeling Architecture (Sprint 2)\n\n### Processing Flow\n```\nExtension records workflow\n  ↓\nPOST /api/workflows (status: draft)\n  ↓\nExtension uploads screenshots\n  ↓\nExtension links screenshots (PATCH /api/steps/{id}/screenshot)\n  ↓\nExtension triggers processing (POST /api/workflows/{id}/start-processing)\n  ↓\nCelery task queued (label_workflow_steps)\n  ↓\nFor each step:\n  - Load screenshot from local storage\n  - Convert to base64 (Claude requires HTTPS)\n  - Call Claude Vision API with tool calling\n  - Extract structured JSON (field_label, instruction, confidence)\n  - Update step in database\n  ↓\nUpdate workflow status to draft\n  ↓\nAdmin reviews in dashboard (/workflows/:id/review)\n```\n\n### AI Service Details\n- **Model**: claude-haiku-4-5-20251001 (fast, cost-effective, vision)\n- **Tool Calling**: `record_workflow_labels` with explicit schema\n- **Cost**: ~$0.03-0.05 per 6-step workflow\n- **Fallback**: Template-based labels when AI fails or no screenshot\n- **Local Storage**: Screenshots in `backend/screenshots/companies/{id}/workflows/{id}/`\n- **Base64 Encoding**: Required for local files (Claude needs HTTPS URLs)\n\n### Key Endpoints Added\n- `POST /api/workflows/{id}/start-processing` - Trigger AI labeling\n- `PATCH /api/steps/{id}/screenshot?screenshot_id={id}` - Link screenshots\n- `GET /api/screenshots/{id}/image` - Serve screenshot files\n- `PUT /api/steps/{id}` - Update step labels (admin edits)\n- `PUT /api/workflows/{id}` - Update workflow status (with validation)\n\n---\n\n## Development Workflow\n\n### 1. Starting the Dev Environment\n```bash\n# Terminal 1: Backend API\ncd backend\nsource venv/bin/activate\nuvicorn app.main:app --reload\n\n# Terminal 2: Celery Worker (REQUIRED for AI labeling)\ncd backend\nsource venv/bin/activate\ncelery -A app.celery_app worker --loglevel=info\n\n# Terminal 3: Dashboard\ncd dashboard\nnpm run dev\n\n# Terminal 4: Extension\ncd extension\nnpm run dev\n# Then load unpacked extension from dist/ folder in Chrome\n```\n\n**Note**: Celery worker MUST be running for AI labeling to work!

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
- `anthropic>=0.74.0` - AI vision API (upgraded from 0.7.1)
- `celery` - Background jobs
- `redis` - Celery message broker
- `boto3` - AWS S3 client (not used in MVP - using local storage)

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

## Development Tools

### Chrome DevTools MCP (Added Dec 2024)

We use Chrome DevTools MCP for AI-assisted debugging of the Chrome extension and dashboard.

**What it enables:**
- Inspect DOM elements on pages where the extension runs
- View console logs and JavaScript errors
- Monitor network requests to the backend API
- Take screenshots for visual debugging
- Execute JavaScript in page context
- Analyze performance with Chrome tracing

**Setup:**
1. Start Chrome with remote debugging: `./scripts/debug-chrome.sh`
2. In Chrome, go to `chrome://inspect/#remote-debugging` and enable it
3. Claude can now use 26 debugging tools via MCP

**Configuration:**
- MCP server: `npx chrome-devtools-mcp@latest --autoConnect`
- Connects to Chrome on port 9222
- Full documentation: `docs/debugging-with-mcp.md`

**Common debugging prompts:**
- "Check the console for JavaScript errors from the extension"
- "List all network requests to localhost:8000"
- "Take a snapshot of the DOM to find the overlay elements"
- "Take a screenshot of the current page state"

---

## Next Steps

**Current Sprint: Company & User Management System**
Sprint plan at: `.claude/plans/mossy-rolling-kettle.md`

**Immediate Priorities:**
1. Address Codex review feedback on sprint plan (invite lifecycle, SQLite migration)
2. Implement RBAC with 3-tier roles (Admin > Editor > Viewer)
3. Add user suspension capability
4. Integrate Resend for email invites

**Tech Debt (see backlog.md):**
- ~~TEST-FIX-001: Fix backend tests~~ - COMPLETE (Sprint 2)
- ~~TEST-FIX-002: Fix extension tests~~ - COMPLETE (Sprint 2)
- SECURITY-001: XPath injection vulnerability in candidateFinder.ts

See `backlog.md` for full prioritized list and `roadmap.md` for long-term milestones.
