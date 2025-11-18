# Technical Requirements - Workflow Automation Platform

## Technology Stack

### Frontend: Chrome Extension

**Core:**
- **Manifest V3** (required for Chrome Web Store)
- **TypeScript** - Type safety for complex state management
- **React 18** - For popup/sidebar UI components
- **Tailwind CSS** - Utility-first styling

**State Management:**
- **Zustand** - Lightweight state management (team preference, plans to build beyond MVP)

**Build Tools:**
- **Vite** - Fast builds, HMR for development
- **esbuild** - Production bundling

**Why this stack:**
- React + TypeScript = proven, maintainable
- Tailwind = rapid UI development
- Zustand = simple, scales well beyond MVP

---

### Backend: API Server

**Framework:**
- **Python 3.11+ with FastAPI**
- **Pydantic** - Data validation and serialization
- **SQLAlchemy** - ORM for database

**Why FastAPI:**
- Team preference (Python developers)
- Excellent async support
- Auto-generated OpenAPI docs
- Fast development with type hints
- Better for AI integration (most AI libraries are Python)

**Job Queue:**
- **Celery** - Distributed task queue
- **Redis** - Message broker for Celery (also used for task results)

**Why Celery:**
- Python standard for background jobs
- Handles AI labeling tasks asynchronously
- Built-in retry logic and task monitoring

---

### Database

**MVP Database:**
- **SQLite** 
- File-based: `app.db` in project root
- Zero configuration, perfect for early development

**Why SQLite for MVP:**
- No setup required (starts immediately)
- Single file database (easy backups, testing)
- Sufficient for 100-500 companies
- Fast for read-heavy workloads
- Easy migration to PostgreSQL later (SQLAlchemy makes this seamless)

**When to migrate to PostgreSQL:**
- ~500 active companies
- Need for concurrent writes at scale
- Advanced indexing requirements
- Production deployment requiring high availability

**Migration Path:**
```python
# Same SQLAlchemy models work for both
# Just change connection string:
# SQLite: sqlite:///./app.db
# PostgreSQL: postgresql://user:pass@host/db
```

---

### File Storage

**Screenshots:**
- **AWS S3** 
- Pre-signed URLs (15-minute expiration)
- Bucket: Private, not publicly accessible

**Structure:**
```
workflow-screenshots-prod/
  companies/
    {company_id}/
      workflows/
        {workflow_id}/
          screenshots/
            {screenshot_id}.jpg
```

**Why S3:**
- Industry standard, reliable
- Cheap (~$0.023/GB)
- Pre-signed URLs solve auth elegantly
- Easy CDN integration later (CloudFront)

---

### Authentication

**MVP Approach:**
- **Email + Password** (manual implementation)
- **Passlib + bcrypt** for password hashing
- **JWT tokens** (7-day expiration)
- **jose** library for JWT handling

**Post-MVP:**
- Google OAuth (social login)
- SSO (SAML/OIDC for enterprise)

---

### AI Services

**Primary:**
- **Anthropic Claude 3.5 Sonnet** (vision + text)
- Python SDK: `anthropic`

**Fallback:**
- **OpenAI GPT-4o** (if Claude rate limits hit)

**Rate Limiting:**
- Max 5 concurrent AI requests (Celery worker configuration)
- Queue additional requests
- Retry with exponential backoff (3 attempts)

---

### Hosting & Infrastructure

**MVP Setup (Minimal Cost):**
- **Backend:** Railway or Render ($5-10/month)
- **Database:** SQLite (included with backend)
- **Redis:** Railway add-on or Upstash free tier
- **S3:** AWS (pay-as-you-go, ~$1-5/month for MVP)
- **Total estimated cost:** ~$10-20/month

**Why Railway/Render:**
- Git-based deploys (push to deploy)
- Free tier or very cheap
- Auto-scaling if needed
- Built-in Redis add-ons

**Production Setup (Future):**
- **Backend:** AWS ECS, Railway Pro, or DigitalOcean
- **Database:** PostgreSQL (AWS RDS or managed service)
- **Redis:** AWS ElastiCache or managed Redis
- **Estimated cost:** ~$100-200/month at scale

---

### Developer Tools (Post-MVP)

**Version Control:**
- **GitHub** (monorepo: extension + backend + dashboard)

**CI/CD (Post-MVP):**
- GitHub Actions (when team grows, for now manual QA is fine)

**Monitoring (Post-MVP):**
- Sentry - Error tracking
- PostHog - Product analytics
- When to add: After beta launch, when tracking real users

**Code Quality (Post-MVP):**
- Black - Python formatter
- Ruff - Fast Python linter
- Mypy - Type checking
- When to add: When codebase >10k lines or team >2 people

---

### What We're NOT Using for MVP

**❌ PostgreSQL** - SQLite sufficient for MVP, migrate later  
**❌ CI/CD Pipeline** - Manual deploys fine for 2-week MVP  
**❌ Monitoring/Analytics** - Add after beta launch  
**❌ Redis (except for Celery)** - No caching layer yet  
**❌ OAuth/SSO** - Email/password only for MVP  
**❌ Rate Limiting** - Nice-to-have, add when we have users  
**❌ Advanced Code Quality Tools** - Keep it simple initially  
**❌ Kubernetes/Docker** - Simple deployment for MVP

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│           USERS (Admins + Regular Users)                 │
│         Desktop/Laptop Only (No Mobile for MVP)          │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
        ┌───────────┐           ┌──────────────┐
        │  Chrome   │           │ Web Dashboard│
        │ Extension │           │   (React)    │
        │           │           │              │
        │ - Record  │           │ - Browse     │
        │ - Guide   │           │ - Review     │
        │ - Overlay │           │ - Manage     │
        └───────────┘           └──────────────┘
                │                       │
                └───────────┬───────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │   API Server (FastAPI)        │
            │  ┌─────────────────────────┐  │
            │  │  REST Endpoints         │  │
            │  │  /auth, /workflows,     │  │
            │  │  /screenshots, /health  │  │
            │  └─────────────────────────┘  │
            │  ┌─────────────────────────┐  │
            │  │  Background Jobs        │  │
            │  │  (Celery + Redis)       │  │
            │  │  - AI labeling queue    │  │
            │  │  - Screenshot uploads   │  │
            │  │  - Health monitoring    │  │
            │  └─────────────────────────┘  │
            └───────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────┐  ┌──────────────┐
    │   SQLite     │ │  Redis   │  │  AWS S3      │
    │  (app.db)    │ │ (Celery  │  │ (Screenshots)│
    │              │ │  Broker) │  │              │
    └──────────────┘ └──────────┘  └──────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   External APIs     │
                 │  - Anthropic Claude │
                 │  - OpenAI GPT-4o    │
                 └─────────────────────┘
```

### Component Responsibilities

**Chrome Extension:**
- **Recording:** Capture user interactions, screenshots, DOM metadata
- **Walkthrough:** Render overlay UI, detect interactions, guide users
- **Communication:** Sync with backend API, manage local state

**Web Dashboard:**
- **Browse:** List workflows, view details, check health status
- **Review:** Edit AI-generated labels, manage workflow metadata
- **Admin:** Company settings, team management, notifications

**Backend API:**
- **Authentication:** User signup, login, JWT management
- **Workflow CRUD:** Create, read, update, delete workflows and steps
- **Health Monitoring:** Track execution, calculate success rates
- **Job Orchestration:** Queue AI tasks, manage background processing

**Celery Workers:**
- **AI Labeling:** Process workflow steps with vision models
- **Screenshot Processing:** Upload to S3, generate thumbnails (future)
- **Health Checks:** Periodic workflow health monitoring (future)

---

### API Design Principles

**RESTful Conventions:**
- `GET /workflows` - List workflows
- `POST /workflows` - Create workflow
- `GET /workflows/:id` - Get single workflow
- `PUT /workflows/:id` - Update workflow
- `DELETE /workflows/:id` - Delete workflow

**Response Format:**
```python
# Success
{
  "data": { ... },
  "meta": { ... }
}

# Error
{
  "error": {
    "code": "WORKFLOW_NOT_FOUND",
    "message": "Workflow with id 'abc123' not found",
    "details": { ... }
  }
}
```

**Authentication:**
- All endpoints require JWT except `/auth/signup`, `/auth/login`
- Header: `Authorization: Bearer {token}`

**Rate Limiting (Post-MVP):**
- Nice-to-have, not essential for MVP
- When to add: After beta launch when we have real traffic
- Initial limits: 100 requests/minute per user

---

### Monorepo Structure

```
workflow-platform/
├── packages/
│   ├── extension/              # Chrome extension
│   │   ├── src/
│   │   │   ├── content/        # Content scripts
│   │   │   │   ├── recorder.ts
│   │   │   │   ├── walkthrough.ts
│   │   │   │   └── overlay.tsx
│   │   │   ├── background/     # Background script
│   │   │   │   └── index.ts
│   │   │   ├── popup/          # Popup UI
│   │   │   │   ├── App.tsx
│   │   │   │   └── components/
│   │   │   ├── shared/         # Shared utilities
│   │   │   │   ├── api.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── storage.ts
│   │   │   └── manifest.json
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── backend/                # FastAPI server
│   │   ├── app/
│   │   │   ├── main.py         # FastAPI app entry
│   │   │   ├── api/            # API routes
│   │   │   │   ├── auth.py
│   │   │   │   ├── workflows.py
│   │   │   │   ├── screenshots.py
│   │   │   │   └── health.py
│   │   │   ├── models/         # SQLAlchemy models
│   │   │   │   ├── company.py
│   │   │   │   ├── user.py
│   │   │   │   ├── workflow.py
│   │   │   │   └── step.py
│   │   │   ├── schemas/        # Pydantic schemas
│   │   │   │   ├── workflow.py
│   │   │   │   ├── step.py
│   │   │   │   └── auth.py
│   │   │   ├── services/       # Business logic
│   │   │   │   ├── auth.py
│   │   │   │   ├── workflow.py
│   │   │   │   └── ai.py
│   │   │   ├── tasks/          # Celery tasks
│   │   │   │   ├── labeling.py
│   │   │   │   └── health.py
│   │   │   ├── db/             # Database utilities
│   │   │   │   ├── session.py
│   │   │   │   └── migrations/ # Alembic migrations
│   │   │   └── utils/          # Helpers
│   │   │       ├── s3.py
│   │   │       ├── jwt.py
│   │   │       └── security.py
│   │   ├── app.db              # SQLite database (gitignored)
│   │   ├── requirements.txt
│   │   └── pyproject.toml
│   │
│   └── dashboard/              # React web app
│       ├── src/
│       │   ├── pages/          # Page components
│       │   │   ├── Dashboard.tsx
│       │   │   ├── WorkflowReview.tsx
│       │   │   ├── Settings.tsx
│       │   │   └── Login.tsx
│       │   ├── components/     # Reusable components
│       │   │   ├── WorkflowCard.tsx
│       │   │   ├── StepList.tsx
│       │   │   └── Navbar.tsx
│       │   ├── hooks/          # Custom React hooks
│       │   │   ├── useWorkflows.ts
│       │   │   └── useAuth.ts
│       │   ├── api/            # API client
│       │   │   └── client.ts
│       │   ├── store/          # Zustand store
│       │   │   └── auth.ts
│       │   └── App.tsx
│       ├── package.json
│       └── vite.config.ts
│
├── .env.example                # Environment variables template
├── README.md                   # Monorepo setup instructions
└── package.json                # Root package (workspace config)
```

**Monorepo Benefits:**
- **Shared types** between extension and dashboard (TypeScript interfaces)
- **Single repo** for version control, easier coordination
- **Simplified deployment** (deploy backend + dashboard together)

**Future Microservices Split:**
When to consider (not MVP):
- Team >10 people (separate teams for different services)
- Need independent scaling (AI service scales differently from API)
- Potential splits:
  - `ai-service` (labeling, healing, vision models)
  - `screenshot-service` (upload, processing, CDN)
  - `core-api` (workflows, auth, health monitoring)

---

### Database Schema

**Note:** Using SQLite for MVP. Schema designed for easy migration to PostgreSQL later.

**Core Tables:**

```sql
-- Companies (Multi-tenant root)
CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_token TEXT UNIQUE NOT NULL,
  settings TEXT DEFAULT '{}',  -- JSON string
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_companies_invite ON companies(invite_token);

-- Users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('admin', 'regular')) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_email ON users(email);

-- Workflows
CREATE TABLE workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  created_by INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  starting_url TEXT NOT NULL,
  tags TEXT DEFAULT '[]',  -- JSON array as string
  status TEXT CHECK (status IN ('draft', 'processing', 'active', 'needs_review', 'broken', 'archived')) DEFAULT 'draft',
  success_rate REAL DEFAULT 0.0,  -- 0.0 to 1.0
  total_uses INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,  -- Track failures for auto-alerts (Story 5.2)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_successful_run TIMESTAMP,
  last_failed_run TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_workflows_company ON workflows(company_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);

-- Steps (one-to-many with workflows)
CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  timestamp TEXT,  -- ISO 8601 string from recording
  action_type TEXT NOT NULL,  -- click, input_commit, select_change, submit, navigate
  
  -- Element identification (stored as JSON strings)
  selectors TEXT NOT NULL,  -- JSON: {primary, css, xpath, data_testid, stable_attrs}
  element_meta TEXT NOT NULL,  -- JSON: {tag_name, role, type, name, etc.}
  page_context TEXT NOT NULL,  -- JSON: {url, title, viewport, page_state_hash}
  action_data TEXT,  -- JSON: {input_value, click_coordinates, etc.}
  dom_context TEXT,  -- JSON: {element_html, parent_html}
  
  -- Screenshot reference
  screenshot_id INTEGER,
  
  -- AI-generated labels (populated after processing)
  field_label TEXT,
  instruction TEXT,
  ai_confidence REAL,  -- 0.0 to 1.0
  ai_model TEXT,
  ai_generated_at TIMESTAMP,
  
  -- Admin edits
  label_edited INTEGER DEFAULT 0,  -- Boolean: 0 or 1
  instruction_edited INTEGER DEFAULT 0,
  edited_by INTEGER,
  edited_at TIMESTAMP,
  
  -- Auto-healing tracking
  healed_selectors TEXT,  -- JSON: {previous_primary, healed_primary}
  healed_at TIMESTAMP,
  healing_confidence REAL,  -- 0.0 to 1.0
  healing_method TEXT,  -- deterministic, ai_assisted
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE SET NULL,
  FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(workflow_id, step_number)
);

CREATE INDEX idx_steps_workflow ON steps(workflow_id);
CREATE INDEX idx_steps_screenshot ON steps(screenshot_id);

-- Screenshots (separate for deduplication)
CREATE TABLE screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  workflow_id INTEGER NOT NULL,
  hash TEXT UNIQUE NOT NULL,  -- SHA-256 hash for deduplication
  storage_key TEXT NOT NULL,  -- S3 object key
  storage_url TEXT NOT NULL,  -- Full S3 URL (or pre-signed)
  file_size INTEGER,  -- bytes
  width INTEGER,
  height INTEGER,
  format TEXT DEFAULT 'jpeg',  -- jpeg, png
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX idx_screenshots_hash ON screenshots(hash);
CREATE INDEX idx_screenshots_workflow ON screenshots(workflow_id);

-- Health Logs (track execution success/failure)
CREATE TABLE health_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL,
  step_id INTEGER,  -- NULL if workflow-level issue
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL,  -- success, healed_deterministic, healed_ai, failed
  error_type TEXT,  -- element_not_found, timeout, navigation_error
  error_message TEXT,
  healing_confidence REAL,
  deterministic_score INTEGER,  -- 0-100
  ai_confidence REAL,  -- 0.0 to 1.0
  candidates_evaluated INTEGER,
  page_state_hash TEXT,
  page_url TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_health_logs_workflow ON health_logs(workflow_id, created_at DESC);
CREATE INDEX idx_health_logs_status ON health_logs(status);

-- Notifications (admin alerts)
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  workflow_id INTEGER,
  type TEXT NOT NULL,  -- workflow_broken, workflow_healed, low_confidence, high_failure_rate
  severity TEXT CHECK (severity IN ('info', 'warning', 'error')) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  read INTEGER DEFAULT 0,  -- Boolean: 0 or 1
  read_by INTEGER,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (read_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_company ON notifications(company_id, read, created_at DESC);
```

---

### SQLAlchemy Models (Python)

```python
# app/models/workflow.py
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.base import Base

class Workflow(Base):
    __tablename__ = "workflows"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    name = Column(String, nullable=False)
    description = Column(Text)
    starting_url = Column(Text, nullable=False)
    tags = Column(Text, default="[]")  # JSON string
    status = Column(String, default="draft")
    success_rate = Column(Float, default=0.0)
    total_uses = Column(Integer, default=0)
    consecutive_failures = Column(Integer, default=0)  # Track failures for auto-alerts
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_successful_run = Column(DateTime(timezone=True))
    last_failed_run = Column(DateTime(timezone=True))
    
    # Relationships (defined separately)
    # steps = relationship("Step", back_populates="workflow", cascade="all, delete-orphan")
```

---

### API Payload Examples

**What gets sent to server vs what's stored:**

**Creating a Workflow (POST /api/workflows):**

```python
# Request payload from extension
{
  "metadata": {
    "name": "Register Invoice",
    "description": "Process for entering invoices",
    "starting_url": "https://app.netsuite.com/invoice/create"
  },
  "steps": [
    {
      "step_number": 1,
      "timestamp": "2025-11-15T10:30:00.000Z",
      "action_type": "click",
      "selectors": {
        "primary": "#vendor_dropdown",
        "css": "form > div.vendor > select",
        "xpath": "//select[@name='vendor']",
        "data_testid": None,
        "stable_attrs": {
          "name": "vendor",
          "aria_label": "Select Vendor"
        }
      },
      "element_meta": {
        "tag_name": "SELECT",
        "role": "combobox",
        "type": None,
        "name": "vendor",
        "placeholder": None,
        "inner_text": "ABC Corp",
        "label_text": "Vendor",
        "nearby_text": "Vendor * Invoice Date Amount",
        "classes": ["vendor-select", "form-control"],
        "bounding_box": {"x": 245, "y": 180, "width": 320, "height": 38},
        "parent_tag": "DIV",
        "parent_classes": ["form-group"]
      },
      "page_context": {
        "url": "https://app.netsuite.com/invoice/create",
        "title": "Create Invoice - NetSuite",
        "viewport": {"width": 1920, "height": 1080},
        "page_state_hash": "sha256:abc123..."
      },
      "action_data": {
        "input_value": "ABC Corp",
        "click_coordinates": {"x": 10, "y": 15}
      },
      "screenshot_ref": {
        "id": "1",  # Already uploaded, reference by ID
        "hash": "sha256:img123..."
      },
      "dom_context": {
        "element_html": "<select name=\"vendor\">...</select>",
        "parent_html": "<div class=\"form-group\">...</div>"
      }
    }
    // ... more steps
  ]
}

# What gets stored in database:
# - Workflow record with metadata
# - Step records with JSON-serialized fields
# - Screenshot references (already in screenshots table)

# Response:
{
  "data": {
    "workflow_id": 123,
    "status": "processing"  # AI labeling queued
  }
}
```

**Screenshot Upload (POST /api/screenshots):**

```python
# Request: multipart/form-data
{
  "workflow_id": "123",
  "step_id": "456",  # Temporary ID from client
  "image_hash": "sha256:abc123...",
  "image": <binary file data>
}

# What happens:
# 1. Check if hash exists (deduplication)
# 2. If new, upload to S3
# 3. Store record in screenshots table
# 4. Return screenshot_id for client to reference

# Response:
{
  "data": {
    "screenshot_id": 1,
    "storage_url": "https://s3.amazonaws.com/bucket/companies/1/workflows/123/screenshots/1.jpg",
    "hash": "sha256:abc123..."
  }
}
```

---

### Migration to PostgreSQL (When Needed)

**SQLite → PostgreSQL Migration Path:**

```python
# 1. Update connection string in config
# SQLite: sqlite:///./app.db
# PostgreSQL: postgresql://user:pass@host:5432/dbname

# 2. Run migrations with Alembic
alembic upgrade head

# 3. Data migration (if needed)
# SQLite data can be exported and imported to PostgreSQL
# Or: Run both DBs in parallel, sync data, then switch

# 4. Schema changes for PostgreSQL optimization:
# - Change INTEGER to UUID for IDs
# - Use native JSONB instead of TEXT for JSON fields
# - Add PostgreSQL-specific indexes (GIN for JSONB)
```

**Why JSONB is better (PostgreSQL future):**
```sql
-- PostgreSQL version (future)
CREATE TABLE steps (
  selectors JSONB NOT NULL,  -- Can index and query inside JSON
  element_meta JSONB NOT NULL
);

-- Enables queries like:
SELECT * FROM steps WHERE selectors->>'primary' = '#vendor_dropdown';
CREATE INDEX idx_selectors_primary ON steps USING GIN (selectors);
```

**For now (SQLite MVP):**
- Store JSON as TEXT
- Parse in Python (Pydantic handles this automatically)
- Full-table scans are fine for <10k steps
- When we hit performance issues → migrate to PostgreSQL

---

## Core Features Technical Spec

### Feature 1: Workflow Recording

**Recording Flow:**

1. **User initiates recording** (Dashboard → "Create Workflow")
2. **Extension activates** (content script injected)
3. **Event listeners attached** (capture phase)
4. **User performs actions** (clicks, inputs, navigation)
5. **Extension filters meaningful interactions** (ignore noise)
6. **For each meaningful action:**
   - Extract element selectors (ID, CSS, XPath, data-testid)
   - Build element metadata (tag, role, labels, position)
   - Request screenshot from background script
   - Buffer step data locally (IndexedDB)
7. **User stops recording**
8. **Extension uploads workflow** (`POST /api/workflows`)
9. **Backend queues AI labeling job**

**Key Endpoints:**

```json
// POST /api/workflows - Upload workflow with steps
{
  "metadata": {
    "name": "string",
    "description": "string",
    "starting_url": "string"
  },
  "steps": [
    {
      "step_number": 1,
      "action_type": "string",
      "selectors": {},
      "element_meta": {},
      "page_context": {},
      "action_data": {},
      "screenshot_ref": { "id": "string", "hash": "string" },
      "dom_context": {}
    }
  ]
}

// POST /api/screenshots - Upload screenshot (multipart/form-data)
// Fields: workflow_id, step_id, image_hash, image (file)

// Response:
{
  "screenshot_id": "string",
  "storage_url": "string",
  "hash": "string"
}
```

**Data Models (Pydantic Schemas):**

```python
# app/schemas/step.py
from pydantic import BaseModel
from typing import Optional
from enum import Enum

class ActionType(str, Enum):
    click = "click"
    input_commit = "input_commit"
    select_change = "select_change"
    submit = "submit"
    navigate = "navigate"

class Selectors(BaseModel):
    primary: Optional[str] = None  # e.g., "#invoice_number"
    css: Optional[str] = None
    xpath: Optional[str] = None
    data_testid: Optional[str] = None
    stable_attrs: Optional[dict[str, str]] = None

class BoundingBox(BaseModel):
    x: float
    y: float
    width: float
    height: float

class ElementMeta(BaseModel):
    tag_name: str
    role: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    placeholder: Optional[str] = None
    inner_text: Optional[str] = None
    label_text: Optional[str] = None
    nearby_text: Optional[str] = None
    classes: list[str] = []
    bounding_box: BoundingBox
    parent_tag: Optional[str] = None
    parent_classes: Optional[list[str]] = None

class Viewport(BaseModel):
    width: int
    height: int

class PageContext(BaseModel):
    url: str
    title: str
    viewport: Viewport
    page_state_hash: str

class ClickCoordinates(BaseModel):
    x: float
    y: float

class ActionData(BaseModel):
    input_value: Optional[str] = None
    click_coordinates: Optional[ClickCoordinates] = None
    submit_key: Optional[str] = None  # 'enter' or 'button_click'

class ScreenshotRef(BaseModel):
    id: str
    hash: str

class RecordedStep(BaseModel):
    step_number: int
    action_type: ActionType
    selectors: Selectors
    element_meta: ElementMeta
    page_context: PageContext
    action_data: Optional[ActionData] = None
    screenshot_ref: ScreenshotRef
```

**Business Logic (Extension - TypeScript):**

This runs client-side in the Chrome extension during recording:

```typescript
// Meaningful interaction filter (in content script)
function isMeaningfulInteraction(event: Event, element: HTMLElement): boolean {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const type = element.getAttribute('type');
  
  // Interactive controls
  if (tag === 'button' || tag === 'a') return true;
  if (type === 'submit' || type === 'button') return true;
  if (role && ['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab'].includes(role)) {
    return true;
  }
  
  // Form inputs (on blur/submit only, not per-keystroke)
  if (event.type === 'blur' && ['input', 'textarea', 'select'].includes(tag)) {
    return true;
  }
  
  // Navigation
  if (event.type === 'navigate') return true;
  
  return false;
}
```

---

### Feature 2: AI-Powered Step Labeling

**Processing Flow:**

1. **Backend receives workflow upload**
2. **Job queued** (Celery task: `ai-labeling`)
3. **For each step** (max 5 concurrent):
   - Fetch screenshot from S3
   - Build prompt with element metadata
   - Call Claude 3.5 Sonnet API (vision)
   - Parse JSON response
   - Update step with labels
4. **Mark workflow as ready for review**

**AI Prompt Structure:**

```python
# app/tasks/labeling.py
import anthropic
import json
from app.models.step import Step

client = anthropic.Anthropic()

async def generate_step_labels(step: Step) -> dict:
    """Generate AI labels for a workflow step using Claude vision."""
    
    element_meta = json.loads(step.element_meta)
    action_data = json.loads(step.action_data) if step.action_data else {}
    
    prompt = f"""You are helping create interactive workflow guides. 
Analyze this screenshot and element data to generate clear, helpful labels.

ELEMENT INFORMATION:
- Tag: {element_meta.get('tag_name', 'N/A')}
- Type: {element_meta.get('type', 'N/A')}
- Label: {element_meta.get('label_text', 'N/A')}
- Placeholder: {element_meta.get('placeholder', 'N/A')}
- Nearby text: {element_meta.get('nearby_text', 'N/A')}

ACTION: {step.action_type}
{f"VALUE: {action_data.get('input_value')}" if action_data.get('input_value') else ''}

YOUR TASK:
Generate:
1. Short field label (max 5 words)
2. Brief instruction (1-2 sentences, action-oriented)
3. Confidence (0-100)

RESPOND IN JSON:
{{
  "field_label": "...",
  "instruction": "...",
  "confidence": 85
}}"""

    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=500,
        temperature=0.3,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": step.screenshot.storage_url
                    }
                },
                {"type": "text", "text": prompt}
            ]
        }]
    )
    
    # Parse and validate
    result = json.loads(response.content[0].text)
    return {
        "field_label": result["field_label"][:100],
        "instruction": result["instruction"][:500],
        "ai_confidence": result["confidence"] / 100
    }
```

**Fallback Strategy:**

```python
# app/services/ai.py
import json
from app.models.step import Step

def generate_fallback_label(step: Step) -> dict:
    """Generate template-based labels when AI fails."""
    
    verbs = {
        "click": "Click",
        "input_commit": "Enter",
        "select_change": "Select",
        "submit": "Submit",
        "navigate": "Navigate to"
    }
    
    element_meta = json.loads(step.element_meta)
    
    label = (
        element_meta.get("label_text") or 
        element_meta.get("placeholder") or 
        element_meta.get("name") or 
        "Field"
    )
    
    verb = verbs.get(step.action_type, "Complete")
    
    return {
        "field_label": label,
        "instruction": f"{verb} {label.lower()}",
        "ai_confidence": 0.0
    }
```

**Cost & Performance:**
- ~$0.015 per step (Claude 3.5 Sonnet vision)
- Process 5 steps in parallel → 10-step workflow in ~15 seconds
- Retry on failure (max 3 attempts with backoff)

---

### Feature 3: Auto-Healing System

**Healing Flow:**

1. **Walkthrough starts**, attempts to find element using stored selectors
2. **All selectors fail** → Auto-healing triggered
3. **Build candidate set** (same category elements)
4. **Score candidates** (deterministic: role, text, position, attributes)
5. **Filter low scores** (<30), limit to top 10
6. **Check for clear winner** (score ≥80, margin ≥20)
   - If yes → Use element, mark as healed
7. **If no clear winner → Call AI**
8. **AI analyzes** screenshots + candidates
9. **Combine scores** (50% deterministic + 50% AI)
10. **Decision based on final score:**
    - ≥0.80: Accept, update selectors
    - 0.60-0.80: Use for session, flag for review
    - <0.60: Mark as broken, alert admin

**Key Endpoint:**

```json
// POST /api/workflows/:id/auto-heal
// Request:
{
  "step_id": "string",
  "current_screenshot": "string",  // Base64 or S3 URL
  "current_page_state_hash": "string"
}

// Response:
{
  "found": true,
  "selector": "string",
  "confidence": 0.85,
  "method": "deterministic | ai_assisted",
  "should_update": true
}
```

**Deterministic Scoring Algorithm (Extension - TypeScript):**

This runs client-side in the Chrome extension during walkthrough mode:

```typescript
interface ScoredCandidate {
  element: HTMLElement;
  selector: string;
  deterministic_score: number;  // 0-100
}

function scoreCandidate(
  candidate: ElementMeta, 
  original: ElementMeta
): number {
  let score = 0;
  
  // Role match (30 points)
  if (candidate.role === original.role) {
    score += 30;
  } else if (candidate.tag_name === original.tag_name) {
    score += 15;
  }
  
  // Text similarity (30 points)
  const origText = original.label_text || original.inner_text || '';
  const candText = candidate.label_text || candidate.inner_text || '';
  const textSim = stringSimilarity(origText, candText);  // 0-1
  score += textSim * 30;
  
  // Position similarity (20 points)
  const origPos = normalizePosition(original.bounding_box);
  const candPos = normalizePosition(candidate.bounding_box);
  const distance = euclideanDistance(origPos, candPos);
  score += Math.max(0, 20 - distance * 40);
  
  // Attribute match (20 points)
  if (candidate.name && candidate.name === original.name) score += 10;
  if (candidate.aria_label && candidate.aria_label === original.aria_label) score += 5;
  // ... more attribute checks
  
  return Math.min(100, score);
}
```

**AI Healing Integration (Backend - Python):**

This runs server-side when the extension calls the auto-heal API:

```python
# app/services/auto_healing.py
import anthropic
import json
from typing import Optional

client = anthropic.Anthropic()

async def call_ai_for_healing(
    step,
    candidates: list[dict],
    current_screenshot_url: str
) -> dict:
    """Use AI to identify the best matching element from candidates."""
    
    element_meta = json.loads(step.element_meta)
    
    candidates_text = "\n".join([
        f"{i + 1}. {c['metadata']['tag_name']} - \"{c['metadata'].get('label_text', '')}\" (score: {c['deterministic_score']})"
        for i, c in enumerate(candidates)
    ])
    
    prompt = f"""ORIGINAL ELEMENT:
- Tag: {element_meta.get('tag_name', 'N/A')}
- Label: {element_meta.get('label_text', 'N/A')}
- Nearby: {element_meta.get('nearby_text', 'N/A')}

CANDIDATES:
{candidates_text}

Which candidate matches the original element?

RESPOND IN JSON:
{{
  "found": true/false,
  "candidate_index": 1-{len(candidates)} or null,
  "confidence": 0.0-1.0,
  "reason": "..."
}}"""

    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "url", "url": step.screenshot.storage_url}
                },
                {
                    "type": "image",
                    "source": {"type": "url", "url": current_screenshot_url}
                },
                {"type": "text", "text": prompt}
            ]
        }]
    )
    
    return json.loads(response.content[0].text)
```

---

### Feature 4: Walkthrough Mode

**Extension Architecture (TypeScript):**

This runs client-side in the Chrome extension:

```typescript
class WalkthroughController {
  private workflow: Workflow;
  private currentStepIndex: number = 0;
  private overlay: SpotlightOverlay | null = null;
  
  async start() {
    // URL check
    if (!this.isOnCorrectURL()) {
      await this.navigateToStartingURL();
    }
    this.showStep(0);
  }
  
  async showStep(index: number) {
    const step = this.workflow.steps[index];
    
    // Find element (with auto-healing)
    const element = await this.findElement(step);
    if (!element) {
      this.handleElementNotFound(step);
      return;
    }
    
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(500);
    
    // Create overlay
    this.overlay = new SpotlightOverlay(element, step, this.workflow);
    this.overlay.render();
    
    // Setup interaction detection
    this.setupInteractionListeners(element, step);
  }
  
  private setupInteractionListeners(element: HTMLElement, step: Step) {
    const clickListener = (event: Event) => {
      if (event.target === element || element.contains(event.target as Node)) {
        this.onCorrectInteraction();
      } else {
        event.preventDefault();
        event.stopPropagation();
        this.onIncorrectInteraction();
      }
    };
    
    document.addEventListener('click', clickListener, true);
    // Store listener for cleanup
  }
  
  private onCorrectInteraction() {
    // Show success feedback
    this.showSuccessFeedback();
    // Auto-advance after 600ms
    setTimeout(() => this.nextStep(), 600);
  }
}
```

**Overlay Component Structure:**

```typescript
class SpotlightOverlay {
  private elements: {
    backdrop?: HTMLElement;
    spotlight?: HTMLElement;
    tooltip?: HTMLElement;
    progress?: HTMLElement;
  } = {};
  
  render() {
    this.elements.backdrop = this.createBackdrop();
    this.elements.spotlight = this.createSpotlight();
    this.elements.tooltip = this.createTooltip();
    this.elements.progress = this.createProgressBar();
    
    document.body.append(
      this.elements.backdrop,
      this.elements.spotlight,
      this.elements.tooltip,
      this.elements.progress
    );
  }
  
  private createSpotlight(): HTMLElement {
    const rect = this.target.getBoundingClientRect();
    const padding = 8;
    
    const spotlight = document.createElement('div');
    spotlight.style.cssText = `
      position: absolute;
      top: ${rect.top + window.scrollY - padding}px;
      left: ${rect.left + window.scrollX - padding}px;
      width: ${rect.width + padding * 2}px;
      height: ${rect.height + padding * 2}px;
      border: 3px solid #3b82f6;
      border-radius: 6px;
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3), 
                  0 0 0 9999px rgba(0, 0, 0, 0.75);
      z-index: 999998;
      pointer-events: none;
    `;
    
    return spotlight;
  }
  
  cleanup() {
    Object.values(this.elements).forEach(el => el?.remove());
  }
}
```

---

## Security & Compliance

### Authentication Flow

**Signup:**
1. User submits email + password
2. Backend validates email format, password strength
3. Hash password with bcrypt (cost 12)
4. Create user record
5. Generate JWT token (7-day expiration)
6. Return token + user data

**Login:**
1. User submits credentials
2. Backend finds user by email
3. Compare password hash with bcrypt
4. Generate new JWT token
5. Update `last_login_at`
6. Return token + user data

**Token Validation:**
- Every protected endpoint validates JWT
- Check expiration, signature
- Extract `user_id`, `company_id` from token
- Use for authorization (multi-tenant filtering)

### Security Checklist

**✓ HTTPS Only**
- Force HTTPS in production
- HSTS headers enabled
- Redirect HTTP → HTTPS

**✓ Input Validation**
- Validate all API inputs with Pydantic schemas
- Sanitize user-generated content
- Max lengths enforced (prevent DoS)

**✓ SQL Injection Prevention**
- Use parameterized queries (never string concatenation)
- SQLAlchemy ORM for type safety

**✓ XSS Prevention**
- React escapes by default
- Don't use `dangerouslySetInnerHTML` without sanitization
- CSP headers in extension

**✓ CSRF Protection**
- SameSite cookies
- CSRF tokens for state-changing operations

**✓ Data Access Control**
- Every query filters by `company_id`
- Admin vs Regular role enforcement

**✓ Secrets Management**
- Environment variables for API keys
- Never commit secrets to git
- Use `.env.example` for documentation

**Not worried about for MVP:**
- Rate limiting (add when we have real traffic)
- Row-level security (PostgreSQL-specific, we're using SQLite for MVP)
- SOC 2 compliance
- GDPR right-to-be-forgotten automation
- Advanced threat detection
- Penetration testing

---

## Scaling Considerations

**Current Architecture: Monolith + Single DB**
- Good for: 0-1,000 companies, <10M requests/month
- Cost: ~$200/month

**Bottleneck #1: Database (First to hit at scale)**
- **Symptom:** Slow queries, high CPU on DB
- **Timeline:** ~5,000 companies or 50M requests/month
- **Solutions:**
  1. Add read replicas (PostgreSQL streaming replication)
  2. Cache frequently-read data (Redis)
  3. Optimize queries (indexes, query planning)
  4. Vertical scaling (bigger DB instance)

**Bottleneck #2: AI API Costs**
- **Symptom:** High monthly bill, slow labeling queue
- **Timeline:** ~1,000 workflows/day created
- **Solutions:**
  1. Fine-tune smaller model (reduce cost 10x)
  2. Aggressive caching (similar elements → reuse labels)
  3. Batch API calls more efficiently
  4. Consider self-hosted vision model (Llama 3.2 Vision)

**Bottleneck #3: Screenshot Storage**
- **Symptom:** S3 bill growing, slow uploads
- **Timeline:** ~100k workflows (20GB+)
- **Solutions:**
  1. Compress more aggressively
  2. Crop screenshots (focused regions only)
  3. Delete old unused workflows (retention policy)
  4. CDN for faster global delivery

**Bottleneck #4: API Server**
- **Symptom:** High latency, timeouts
- **Timeline:** ~10k concurrent users
- **Solutions:**
  1. Horizontal scaling (multiple API servers + load balancer)
  2. Stateless design (already planned)
  3. CDN for static assets
  4. Separate read/write paths

**When to Consider Microservices:**
- ❌ **Not yet** - Monolith is fine for MVP and first 1-2 years
- ✅ **Later** - When team >10 engineers, need independent deployment
- Split candidates: AI service, screenshot service, health monitoring service

**Database Optimization Paths:**

```sql
-- Add indexes for common queries
CREATE INDEX idx_workflows_company_status ON workflows(company_id, status);
CREATE INDEX idx_steps_workflow_number ON steps(workflow_id, step_number);
CREATE INDEX idx_health_logs_workflow_created ON health_logs(workflow_id, created_at DESC);

-- Partitioning for health logs (when >10M rows)
CREATE TABLE health_logs_2025_11 PARTITION OF health_logs
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Materialized view for analytics
CREATE MATERIALIZED VIEW workflow_stats AS
  SELECT 
    workflow_id,
    COUNT(*) as total_runs,
    AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_rate
  FROM health_logs
  GROUP BY workflow_id;
```

**Caching Strategy (Future):**

```python
# app/utils/cache.py (Post-MVP)
import redis
import json
from functools import wraps

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cached(prefix: str, ttl: int = 300):
    """Decorator for caching function results in Redis."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from function args
            key = f"{prefix}:{args[0] if args else kwargs.get('id')}"
            
            # Check cache
            cached_value = redis_client.get(key)
            if cached_value:
                return json.loads(cached_value)
            
            # Call function and cache result
            result = await func(*args, **kwargs)
            redis_client.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

# Usage examples:
# @cached("workflow", ttl=300)  # 5 minutes
# async def get_workflow(workflow_id: int): ...

# @cached("labels", ttl=86400)  # 24 hours
# async def generate_step_labels(step): ...
```

**Monitoring Alerts (Setup Early):**

```yaml
# alerts.yml
- alert: HighErrorRate
  expr: error_rate > 0.05  # 5% of requests failing
  
- alert: SlowAPIResponse
  expr: p95_latency > 1000  # p95 > 1 second
  
- alert: DatabaseHighCPU
  expr: db_cpu > 80  # DB CPU > 80%
  
- alert: AIQueueBacklog
  expr: ai_queue_depth > 100  # More than 100 jobs waiting
```

---

## Appendix: Development Setup

**Local Environment:**

```bash
# 1. Clone repo
git clone https://github.com/yourorg/workflow-platform
cd workflow-platform

# 2. Install dependencies
# Frontend packages (extension + dashboard)
cd packages/extension && npm install
cd ../dashboard && npm install

# Backend (Python)
cd ../backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Setup environment variables
cp .env.example .env
# Fill in: DATABASE_URL, ANTHROPIC_API_KEY, S3_CREDENTIALS

# 4. Run database migrations
cd packages/backend
alembic upgrade head

# 5. Start dev servers
# Terminal 1: Backend
cd packages/backend && uvicorn app.main:app --reload

# Terminal 2: Celery worker
cd packages/backend && celery -A app.tasks worker --loglevel=info

# Terminal 3: Dashboard
cd packages/dashboard && npm run dev

# Terminal 4: Extension (build and load in Chrome)
cd packages/extension && npm run dev
```

**Project Structure:**

```
workflow-platform/
├── packages/
│   ├── extension/              # Chrome extension (TypeScript)
│   │   ├── src/
│   │   │   ├── content/        # Content scripts
│   │   │   ├── background/     # Background script
│   │   │   ├── popup/          # Popup UI
│   │   │   └── types/          # Shared types
│   │   ├── manifest.json
│   │   └── package.json
│   │
│   ├── backend/                # API server (Python/FastAPI)
│   │   ├── app/
│   │   │   ├── main.py         # FastAPI app entry
│   │   │   ├── api/            # API routes
│   │   │   │   ├── auth.py
│   │   │   │   ├── workflows.py
│   │   │   │   ├── steps.py
│   │   │   │   ├── screenshots.py
│   │   │   │   └── notifications.py
│   │   │   ├── models/         # SQLAlchemy models
│   │   │   ├── schemas/        # Pydantic schemas
│   │   │   ├── services/       # Business logic
│   │   │   ├── tasks/          # Celery tasks
│   │   │   ├── db/             # Database utilities
│   │   │   └── utils/          # Helpers
│   │   ├── app.db              # SQLite database (gitignored)
│   │   ├── requirements.txt
│   │   ├── alembic.ini         # Alembic config
│   │   └── pyproject.toml
│   │
│   └── dashboard/              # Web UI (React/TypeScript)
│       ├── src/
│       │   ├── pages/          # Page components
│       │   ├── components/     # Reusable components
│       │   ├── hooks/          # Custom hooks
│       │   └── api/            # API client
│       └── package.json
│
├── .env.example
└── README.md
```

---

**End of Technical Requirements**
