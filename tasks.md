# Tasks & Sprint Plan

Current sprint tasks, backlog, and technical debt tracking.

---

## Sprint 1: Foundation & Core Infrastructure

**Sprint Goal**: Establish backend API foundation, database schema, authentication system, and basic extension recording capability.

**Sprint Duration**: 2 weeks
**Target Completion**: 2025-12-03
**Committed Story Points**: 34 SP

---

## EPIC-001: Backend Infrastructure
**Goal**: Build production-ready backend API with authentication, database, and core endpoints
**Success Metrics**: Backend running, auth working, database migrations functional
**Target Completion**: Sprint 1

### BE-001: Database Models & Migrations Setup
**Type**: Backend Foundation
**Priority**: P0 (Critical)
**Epic**: EPIC-001
**Estimate**: 5 SP
**Status**: 🔴 Not Started

**Description**:
Set up SQLAlchemy models for all core tables (companies, users, workflows, steps, screenshots, health_logs, notifications). Configure Alembic for database migrations. Create initial migration script.

**Acceptance Criteria**:
- [ ] SQLAlchemy models created for all tables matching technical spec
- [ ] Alembic configured with proper migration directory
- [ ] Initial migration script created and tested
- [ ] Database relationships properly defined (foreign keys, cascades)
- [ ] Indexes created for common query patterns
- [ ] Migration can create SQLite database from scratch
- [ ] Migration can be rolled back cleanly

**Technical Context**:
- **Dependencies**: None (foundational task)
- **Affected Components**:
  - `packages/backend/app/models/` - SQLAlchemy models
  - `packages/backend/app/db/` - Database session management
  - `packages/backend/alembic/` - Migration scripts
- **Key Files**:
  - `app/models/company.py` - Company model
  - `app/models/user.py` - User model
  - `app/models/workflow.py` - Workflow model
  - `app/models/step.py` - Step model
  - `app/models/screenshot.py` - Screenshot model
  - `app/models/health_log.py` - HealthLog model
  - `app/models/notification.py` - Notification model
  - `app/db/session.py` - Database session factory
  - `app/db/base.py` - Base model class
  - `alembic.ini` - Alembic configuration
  - `alembic/env.py` - Migration environment
- **Considerations**:
  - Use TEXT fields for JSON in SQLite (will migrate to JSONB in PostgreSQL)
  - Ensure proper timezone handling for timestamps
  - Multi-tenancy: All models except Company/User need company_id
  - Follow naming convention: table names plural, snake_case

**Definition of Done**:
- Code complete and reviewed
- Can run `alembic upgrade head` successfully
- Can run `alembic downgrade base` successfully
- Database schema matches technical requirements spec
- models/__init__.py exports all models
- Documentation updated in memory.md

---

### BE-002: Authentication System (Signup/Login)
**Type**: Backend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-001
**Estimate**: 5 SP
**Status**: 🔴 Not Started

**Description**:
Implement user signup and login endpoints with JWT token generation. Password hashing with bcrypt. Email validation. Multi-tenant company isolation.

**Acceptance Criteria**:
- [ ] POST /api/auth/signup endpoint working
- [ ] POST /api/auth/login endpoint working
- [ ] Password hashing with bcrypt (cost factor 12)
- [ ] JWT token generation with 7-day expiration
- [ ] Email format validation
- [ ] Password strength validation (min 8 chars, contains letter + number)
- [ ] Company invite token validation on signup
- [ ] Returns user data + token on success
- [ ] Proper error messages for invalid credentials
- [ ] Tests for all auth endpoints

**Technical Context**:
- **Dependencies**: BE-001 (Database models must exist)
- **Affected Components**:
  - `packages/backend/app/api/auth.py` - Auth endpoints
  - `packages/backend/app/schemas/auth.py` - Pydantic schemas
  - `packages/backend/app/services/auth.py` - Auth business logic
  - `packages/backend/app/utils/security.py` - Password hashing
  - `packages/backend/app/utils/jwt.py` - JWT utilities
- **Key Files**:
  - `app/api/auth.py` - FastAPI router with signup/login endpoints
  - `app/schemas/auth.py` - SignupRequest, LoginRequest, TokenResponse schemas
  - `app/services/auth.py` - create_user, authenticate_user functions
  - `app/utils/security.py` - hash_password, verify_password functions
  - `app/utils/jwt.py` - create_access_token, decode_token functions
- **Considerations**:
  - JWT payload should include: user_id, company_id, role, email
  - Use python-jose for JWT handling
  - Use passlib with bcrypt for password hashing
  - Ensure email uniqueness constraint
  - Company invite token allows first user to create company (admin role)

**Definition of Done**:
- All endpoints respond correctly
- Password never stored in plain text
- JWT tokens validate correctly
- Unit tests for auth service (>80% coverage)
- Integration tests for API endpoints
- Can authenticate via curl and receive valid token
- Error handling for duplicate emails, invalid tokens
- Documentation added to docs/api/auth.md

---

### BE-003: JWT Authentication Middleware
**Type**: Backend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-001
**Estimate**: 3 SP
**Status**: 🔴 Not Started

**Description**:
Create FastAPI dependency for JWT token validation. Extract user context from token. Ensure all protected endpoints validate authentication. Add role-based access control helpers.

**Acceptance Criteria**:
- [ ] JWT validation dependency created
- [ ] Token expiration checked
- [ ] User context extracted (user_id, company_id, role)
- [ ] Invalid/expired tokens return 401 Unauthorized
- [ ] Missing tokens return 401 Unauthorized
- [ ] Role-based helpers: require_admin, require_user
- [ ] Works with all API endpoints (except /auth/signup, /auth/login)
- [ ] Tests for valid/invalid/expired tokens

**Technical Context**:
- **Dependencies**: BE-002 (Auth system must exist)
- **Affected Components**:
  - `packages/backend/app/utils/dependencies.py` - Auth dependencies
  - `packages/backend/app/main.py` - Register global dependencies
- **Key Files**:
  - `app/utils/dependencies.py` - get_current_user, get_current_admin dependencies
  - `app/utils/jwt.py` - decode_token function
- **Considerations**:
  - Use FastAPI Depends() for dependency injection
  - Raise HTTPException with 401 for auth failures
  - Extract Authorization header: "Bearer {token}"
  - Cache user lookups if needed (future optimization)

**Definition of Done**:
- Dependency can be added to any endpoint
- Invalid tokens properly rejected
- User context available in endpoint handlers
- Tests for all auth scenarios
- All future API endpoints use this dependency
- Documentation in docs/api/authentication.md

---

### BE-004: Workflow CRUD Endpoints
**Type**: Backend Feature
**Priority**: P1 (High)
**Epic**: EPIC-001
**Estimate**: 8 SP
**Status**: 🔴 Not Started

**Description**:
Implement RESTful API endpoints for workflow management: create, list, get single, update, delete. Includes multi-tenant filtering, step creation, screenshot references.

**Acceptance Criteria**:
- [ ] POST /api/workflows - Create workflow with steps
- [ ] GET /api/workflows - List workflows (filtered by company_id)
- [ ] GET /api/workflows/:id - Get single workflow with steps
- [ ] PUT /api/workflows/:id - Update workflow metadata
- [ ] DELETE /api/workflows/:id - Delete workflow (cascade steps)
- [ ] All endpoints enforce multi-tenant isolation
- [ ] Proper validation of input data (Pydantic schemas)
- [ ] Returns 404 for non-existent workflows
- [ ] Returns 403 for unauthorized access (different company)
- [ ] Steps created in correct order (step_number)
- [ ] Screenshot references validated
- [ ] Tests for all CRUD operations

**Technical Context**:
- **Dependencies**: BE-001 (Database models), BE-003 (Auth middleware)
- **Affected Components**:
  - `packages/backend/app/api/workflows.py` - Workflow endpoints
  - `packages/backend/app/schemas/workflow.py` - Workflow schemas
  - `packages/backend/app/services/workflow.py` - Workflow business logic
- **Key Files**:
  - `app/api/workflows.py` - FastAPI router
  - `app/schemas/workflow.py` - CreateWorkflowRequest, WorkflowResponse, etc.
  - `app/services/workflow.py` - create_workflow, get_workflows, etc.
- **Considerations**:
  - Always filter by company_id from JWT token
  - When creating workflow, also create step records
  - Use transactions for workflow + steps creation
  - Implement pagination for GET /api/workflows (limit/offset)
  - Include step count and success_rate in list response

**Definition of Done**:
- All CRUD operations work
- Multi-tenant isolation verified
- Unit tests for service layer
- Integration tests for API endpoints
- Proper error handling
- Documentation in docs/api/workflows.md
- Can create workflow via curl/Postman

---

### BE-005: Screenshot Upload Endpoint
**Type**: Backend Feature
**Priority**: P1 (High)
**Epic**: EPIC-001
**Estimate**: 5 SP
**Status**: 🔴 Not Started

**Description**:
Implement screenshot upload endpoint with S3 storage, deduplication via SHA-256 hash, multipart form handling. Returns screenshot_id for client to reference in workflow steps.

**Acceptance Criteria**:
- [ ] POST /api/screenshots - Upload screenshot (multipart/form-data)
- [ ] Validates image format (JPEG, PNG only)
- [ ] Calculates SHA-256 hash of image
- [ ] Checks if hash exists (deduplication)
- [ ] If exists, returns existing screenshot_id
- [ ] If new, uploads to S3
- [ ] Stores record in screenshots table
- [ ] Returns screenshot_id and storage_url
- [ ] Generates S3 pre-signed URLs (15-min expiration)
- [ ] Proper error handling for S3 failures
- [ ] Tests with sample images

**Technical Context**:
- **Dependencies**: BE-001 (Database models), BE-003 (Auth middleware)
- **Affected Components**:
  - `packages/backend/app/api/screenshots.py` - Screenshot endpoints
  - `packages/backend/app/schemas/screenshot.py` - Screenshot schemas
  - `packages/backend/app/utils/s3.py` - S3 utilities
- **Key Files**:
  - `app/api/screenshots.py` - POST /api/screenshots endpoint
  - `app/schemas/screenshot.py` - UploadScreenshotRequest, ScreenshotResponse
  - `app/utils/s3.py` - upload_to_s3, generate_presigned_url functions
- **Considerations**:
  - Use boto3 for S3 operations
  - S3 bucket structure: companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.jpg
  - Store both hash and storage_key in database
  - Max file size: 5MB (FastAPI limit)
  - Image optimization: Convert to JPEG, compress to ~80% quality

**Definition of Done**:
- Can upload screenshots successfully
- Deduplication works (same image returns same ID)
- S3 storage verified
- Pre-signed URLs work
- Unit tests for S3 utilities
- Integration tests for upload endpoint
- Error handling for network failures
- Documentation in docs/api/screenshots.md

---

## EPIC-002: Chrome Extension Foundation
**Goal**: Build extension structure with recording capability and content script injection
**Success Metrics**: Extension loads in Chrome, can inject content scripts, basic event capture works
**Target Completion**: Sprint 1

### FE-001: Extension Build Configuration
**Type**: Frontend Setup
**Priority**: P0 (Critical)
**Epic**: EPIC-002
**Estimate**: 3 SP
**Status**: 🔴 Not Started

**Description**:
Configure Vite for Chrome extension build. Set up TypeScript config. Configure Tailwind CSS. Ensure manifest.json, content scripts, background worker, and popup build correctly.

**Acceptance Criteria**:
- [ ] Vite builds extension to dist/ folder
- [ ] Manifest V3 copied to dist/
- [ ] Content scripts bundled correctly
- [ ] Background service worker bundled as ES module
- [ ] Popup UI builds with React
- [ ] TypeScript compilation working
- [ ] Tailwind CSS processing working
- [ ] HMR (hot reload) works in dev mode
- [ ] Production build optimized (minified)
- [ ] Can load extension in Chrome without errors

**Technical Context**:
- **Dependencies**: None (foundational task)
- **Affected Components**:
  - `packages/extension/` - All extension files
- **Key Files**:
  - `packages/extension/vite.config.ts` - Vite configuration
  - `packages/extension/tsconfig.json` - TypeScript configuration
  - `packages/extension/tailwind.config.js` - Tailwind configuration
  - `packages/extension/postcss.config.js` - PostCSS configuration
- **Considerations**:
  - Use @crxjs/vite-plugin or custom Vite config for extension
  - Ensure content scripts use IIFE format (no module format for injected scripts)
  - Background worker must be ES module for Manifest V3
  - Chrome extension CSP restrictions (no inline scripts)

**Definition of Done**:
- npm run dev builds extension
- npm run build creates production bundle
- Extension loads in Chrome successfully
- No console errors in extension pages
- Documentation in packages/extension/README.md

---

### FE-002: Shared Types & API Client
**Type**: Frontend Foundation
**Priority**: P1 (High)
**Epic**: EPIC-002
**Estimate**: 3 SP
**Status**: 🔴 Not Started

**Description**:
Create shared TypeScript types matching backend Pydantic schemas. Build API client for making authenticated requests to backend. Handle token storage in chrome.storage.

**Acceptance Criteria**:
- [ ] TypeScript interfaces for all domain models (Workflow, Step, etc.)
- [ ] API client class with methods for all endpoints
- [ ] Token storage/retrieval from chrome.storage.local
- [ ] Automatic Authorization header injection
- [ ] Error handling for network failures
- [ ] Type-safe request/response handling
- [ ] Can authenticate and make API calls
- [ ] Tests for API client

**Technical Context**:
- **Dependencies**: BE-002 (Auth endpoints), FE-001 (Build config)
- **Affected Components**:
  - `packages/extension/src/shared/` - Shared utilities
- **Key Files**:
  - `src/shared/types.ts` - Domain type definitions
  - `src/shared/api.ts` - API client class
  - `src/shared/storage.ts` - Chrome storage utilities
- **Considerations**:
  - Use chrome.storage.local for token persistence
  - API base URL from environment or config
  - Handle CORS (backend configured for extension origin)
  - Retry logic for transient failures (3 attempts with backoff)

**Definition of Done**:
- Types match backend schemas exactly
- API client works for all endpoints
- Token persistence works across extension reload
- Error handling tested
- Documentation in src/shared/README.md

---

### FE-003: Background Service Worker
**Type**: Frontend Feature
**Priority**: P1 (High)
**Epic**: EPIC-002
**Estimate**: 3 SP
**Status**: 🔴 Not Started

**Description**:
Implement background service worker for message passing, screenshot capture, state management. Handle extension lifecycle events. Coordinate between content scripts and popup.

**Acceptance Criteria**:
- [ ] Service worker registers successfully
- [ ] Message passing between content scripts and background
- [ ] Screenshot capture using chrome.tabs.captureVisibleTab
- [ ] State management (recording status, current workflow)
- [ ] Handles chrome.runtime.onMessage
- [ ] Handles chrome.tabs events (navigation, updates)
- [ ] Can inject content scripts dynamically
- [ ] No service worker crashes or errors

**Technical Context**:
- **Dependencies**: FE-001 (Build config), FE-002 (API client)
- **Affected Components**:
  - `packages/extension/src/background/` - Background worker
- **Key Files**:
  - `src/background/index.ts` - Main service worker
  - `src/background/messaging.ts` - Message handler
  - `src/background/screenshot.ts` - Screenshot capture
- **Considerations**:
  - Service workers have limited lifetime (must be stateless)
  - Use chrome.storage for persistent state
  - Screenshot capture requires activeTab permission
  - Handle async message passing correctly

**Definition of Done**:
- Service worker stable
- Message passing works reliably
- Screenshots captured successfully
- State persists across worker restarts
- Error handling for permission issues
- Documentation in src/background/README.md

---

### FE-004: Popup UI (Login/Recording Controls)
**Type**: Frontend Feature
**Priority**: P1 (High)
**Epic**: EPIC-002
**Estimate**: 5 SP
**Status**: 🔴 Not Started

**Description**:
Build extension popup with login form, recording start/stop controls, workflow list. Use React + Tailwind. Zustand for state management. Connect to backend API.

**Acceptance Criteria**:
- [ ] Login form (email + password)
- [ ] Displays authentication errors
- [ ] Stores JWT token on successful login
- [ ] Shows "Start Recording" button when logged in
- [ ] Shows "Stop Recording" button when recording
- [ ] Lists recent workflows
- [ ] Logout functionality
- [ ] Responsive design (fits popup size)
- [ ] Loading states for async operations
- [ ] Error handling with user-friendly messages

**Technical Context**:
- **Dependencies**: FE-002 (API client), BE-002 (Auth endpoints)
- **Affected Components**:
  - `packages/extension/src/popup/` - Popup UI
- **Key Files**:
  - `src/popup/App.tsx` - Main popup component
  - `src/popup/components/LoginForm.tsx` - Login form
  - `src/popup/components/RecordingControls.tsx` - Recording controls
  - `src/popup/store/auth.ts` - Zustand auth store
  - `src/popup/index.html` - Popup HTML
- **Considerations**:
  - Popup size: 400px × 600px typical
  - Use Zustand for global state (auth, workflows)
  - Communicate with background worker for recording state
  - Handle popup closing (state must persist)

**Definition of Done**:
- UI renders correctly
- Login/logout works
- Recording controls functional
- State persists when popup closes
- No console errors
- Documentation in src/popup/README.md

---

### FE-005: Content Script - Event Recorder
**Type**: Frontend Feature
**Priority**: P1 (High)
**Epic**: EPIC-002
**Estimate**: 8 SP
**Status**: 🔴 Not Started

**Description**:
Implement content script for capturing user interactions (clicks, inputs, navigation). Extract element selectors, metadata, bounding boxes. Filter meaningful interactions. Buffer steps locally before upload.

**Acceptance Criteria**:
- [ ] Captures click events on interactive elements
- [ ] Captures input blur events (not every keystroke)
- [ ] Captures select change events
- [ ] Captures form submit events
- [ ] Captures navigation events
- [ ] Extracts element selectors (ID, CSS, XPath, data-testid)
- [ ] Extracts element metadata (tag, role, labels, position)
- [ ] Filters out non-meaningful interactions
- [ ] Requests screenshot from background worker
- [ ] Buffers steps in IndexedDB
- [ ] Step numbering sequential
- [ ] Page context captured (URL, title, viewport)
- [ ] Can stop recording and upload workflow

**Technical Context**:
- **Dependencies**: FE-003 (Background worker), BE-004 (Workflow endpoints)
- **Affected Components**:
  - `packages/extension/src/content/` - Content scripts
- **Key Files**:
  - `src/content/recorder.ts` - Main recorder logic
  - `src/content/utils/selectors.ts` - Selector extraction
  - `src/content/utils/metadata.ts` - Element metadata extraction
  - `src/content/utils/filters.ts` - Meaningful interaction filter
  - `src/content/storage/indexeddb.ts` - IndexedDB wrapper
- **Considerations**:
  - Use capture phase for event listeners (before other handlers)
  - Debounce input events (capture on blur only)
  - Handle dynamically added elements
  - XPath generation for elements without IDs
  - Bounding box: use getBoundingClientRect()
  - Page state hash: hash of DOM structure for change detection

**Definition of Done**:
- All interaction types captured
- Selectors robust and accurate
- Metadata complete
- Steps stored locally
- Can upload workflow successfully
- No performance impact on host page
- Tests with sample web pages
- Documentation in src/content/README.md

---

## EPIC-003: Web Dashboard Foundation
**Goal**: Build dashboard with authentication, workflow list, basic navigation
**Success Metrics**: Dashboard loads, login works, can view workflow list
**Target Completion**: Sprint 1

### FE-006: Dashboard Build & Routing Setup
**Type**: Frontend Setup
**Priority**: P1 (High)
**Epic**: EPIC-003
**Estimate**: 2 SP
**Status**: 🔴 Not Started

**Description**:
Configure Vite + React for dashboard. Set up React Router for navigation. Configure Tailwind CSS. Create basic layout with navigation.

**Acceptance Criteria**:
- [ ] Vite dev server runs
- [ ] React Router configured
- [ ] Tailwind CSS working
- [ ] Routes: /login, /dashboard, /workflows/:id
- [ ] Basic layout component (navbar, content area)
- [ ] TypeScript compilation working
- [ ] No console errors
- [ ] Production build works

**Technical Context**:
- **Dependencies**: None (foundational task)
- **Affected Components**:
  - `packages/dashboard/` - All dashboard files
- **Key Files**:
  - `packages/dashboard/vite.config.ts` - Vite config
  - `packages/dashboard/tsconfig.json` - TypeScript config
  - `packages/dashboard/tailwind.config.js` - Tailwind config
  - `src/App.tsx` - Main app with routes
  - `src/components/Layout.tsx` - Layout component
- **Considerations**:
  - Use React Router v6
  - Protected routes for authenticated pages
  - Redirect to /login if not authenticated

**Definition of Done**:
- Dev server runs successfully
- Routing works
- Layout renders correctly
- Production build successful
- Documentation in packages/dashboard/README.md

---

### FE-007: Dashboard Authentication Pages
**Type**: Frontend Feature
**Priority**: P1 (High)
**Epic**: EPIC-003
**Estimate**: 3 SP
**Status**: 🔴 Not Started

**Description**:
Build login and signup pages. Form validation. API integration. Token storage in localStorage. Redirect after authentication.

**Acceptance Criteria**:
- [ ] Login page with email/password form
- [ ] Signup page with email/password/company invite form
- [ ] Client-side validation (email format, password strength)
- [ ] API integration with backend auth endpoints
- [ ] Display server errors (invalid credentials, etc.)
- [ ] Store JWT token in localStorage
- [ ] Redirect to /dashboard after login
- [ ] "Remember me" functionality
- [ ] Loading states during API calls
- [ ] Tests for form validation

**Technical Context**:
- **Dependencies**: FE-006 (Routing setup), BE-002 (Auth endpoints)
- **Affected Components**:
  - `packages/dashboard/src/pages/` - Auth pages
  - `packages/dashboard/src/store/` - Auth store
- **Key Files**:
  - `src/pages/Login.tsx` - Login page
  - `src/pages/Signup.tsx` - Signup page
  - `src/store/auth.ts` - Zustand auth store
  - `src/api/client.ts` - API client
- **Considerations**:
  - Use Zustand for auth state
  - API client similar to extension
  - localStorage for token (or sessionStorage)
  - Protected route wrapper checks auth state

**Definition of Done**:
- Login/signup forms work
- Authentication successful
- Token stored correctly
- Redirects work
- Error handling tested
- Documentation in src/pages/README.md

---

## Backlog (Future Sprints)

### Sprint 2: AI Labeling & Walkthrough Mode
- AI-001: Celery Task Queue Setup
- AI-002: Claude Vision API Integration
- AI-003: Step Labeling Background Job
- FE-008: Walkthrough Mode Overlay UI
- FE-009: Element Finding & Auto-Healing (Deterministic)

### Sprint 3: Auto-Healing & Health Monitoring
- FE-010: Auto-Healing AI Integration
- BE-006: Health Monitoring Endpoints
- BE-007: Notification System
- FE-011: Dashboard Workflow Review Page

### Sprint 4: Polish & Testing
- TEST-001: End-to-End Testing Setup
- PERF-001: Performance Optimization
- DOC-001: User Documentation
- BUG-XXX: Bug fixes from testing

---

## Technical Debt

None yet. Will track as project evolves.

---

## Blockers

None currently.

---

## Notes

- **Sprint velocity**: TBD after Sprint 1 completion
- **Risk areas**: S3 setup, Chrome extension permissions, AI API rate limits
- **Next sprint planning**: After Sprint 1 completion
