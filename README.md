# Workflow Automation Platform

AI-powered Chrome extension for recording, managing, and executing interactive web workflows.

## 📚 Documentation

### Technical Documentation
- **[API Reference](./docs/API_EXAMPLES.md)** - Complete REST API documentation
- **[Architecture](./docs/architecture.md)** - System architecture and component interaction
- **[Testing Guide](./docs/guides/TESTING_GUIDE.md)** - Testing procedures and scenarios

### Project Knowledge
- **[Memory](./memory.md)** - Project context and architectural decisions
- **[Backlog](./backlog.md)** - Prioritized future work

### Design Documentation
- **[Design Docs](./design_docs/)** - Business plan, product design, roadmap

---

## Quick Start (5 Minutes)

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18+ | `node --version` |
| Python | 3.11+ | `python --version` |
| npm | 9+ | `npm --version` |
| Chrome | Latest | For extension testing |

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd OverlayMVP

# Install all npm packages (root, dashboard, extension)
npm install

# Set up Python virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### Step 2: Configure Environment

```bash
# Create env file manually
touch backend/.env
```

Edit `backend/.env` with your values:

```env
# Required for development
JWT_SECRET_KEY=generate-a-secure-random-key-here
DATABASE_URL=sqlite:///./app.db

# Required for AI labeling (get from Anthropic Console)
ANTHROPIC_API_KEY=sk-ant-...

# Optional - for screenshot storage (uses local filesystem if not set)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
```

**Generate a secure JWT key:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 3: Initialize Database

```bash
cd backend
source venv/bin/activate
alembic upgrade head
cd ..
```

### Step 4: Start Development Servers

You need **3 terminal windows**:

**Terminal 1 - Backend API:**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Web Dashboard:**
```bash
cd dashboard
npm run dev
```

**Terminal 3 - Celery Worker (for AI labeling):**
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app worker --loglevel=info
```

### Step 5: Load Chrome Extension

```bash
cd extension
npm run build
```

Load in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `extension/dist/` folder

### Step 6: Verify Setup

| Component | URL | Expected |
|-----------|-----|----------|
| Backend API | http://localhost:8000/docs | Swagger UI |
| Dashboard | http://localhost:3000 | Login page |
| Extension | Chrome toolbar icon | Popup appears |

### Step 7: Create Test Account

1. Open http://localhost:3000/signup
2. Enter email, password, name, and company name
3. Click "Create Account"
4. You'll be redirected to the dashboard

---

## First Workflow Test

### Recording a Workflow

1. Click the extension icon in Chrome toolbar
2. Click **Start Recording**
3. Navigate to any website (e.g., https://example.com)
4. Perform some actions (clicks, text input)
5. Click **Stop Recording**
6. The workflow is saved and sent for AI labeling

### Viewing in Dashboard

1. Open http://localhost:3000
2. Your recorded workflow appears in the list
3. Click to view step details and screenshots

### Running a Walkthrough

1. Click the extension icon
2. Select your recorded workflow
3. Click **Start Walkthrough**
4. Follow the guided overlay instructions

---

## Troubleshooting

### Backend won't start

```bash
# Check virtual environment is activated
which python  # Should show venv path

# Check all dependencies installed
pip install -r requirements.txt

# Check database migrations
alembic upgrade head

# Check port 8000 is free
lsof -i :8000
```

### Dashboard shows "Network Error"

```bash
# Verify backend is running
curl http://localhost:8000/api/health

# Check CORS is configured (backend should allow localhost:3000)
```

### Extension doesn't load

```bash
# Rebuild the extension
cd extension
npm run build

# Check for build errors
npm run build 2>&1 | head -50

# Reload in Chrome:
# 1. Go to chrome://extensions
# 2. Click refresh icon on the extension card
```

### AI Labeling not working

```bash
# Check Celery worker is running
# Should see "celery@hostname ready" message

# Check ANTHROPIC_API_KEY is set
echo $ANTHROPIC_API_KEY

# Check Redis is running (if using Redis)
redis-cli ping  # Should return PONG
```

### Database errors

```bash
# Reset database (development only!)
cd backend
rm app.db  # Delete SQLite file
alembic upgrade head  # Recreate tables
```

---

## Project Structure

```
workflow-platform/
├── extension/           # Chrome extension (TypeScript + React)
│   ├── src/
│   │   ├── background/  # Service worker
│   │   ├── content/     # Content scripts (recording, walkthrough)
│   │   ├── popup/       # Extension popup UI
│   │   └── shared/      # Shared types and utilities
│   └── dist/            # Built extension (load this in Chrome)
│
├── backend/             # FastAPI server (Python)
│   ├── app/
│   │   ├── api/         # REST endpoints
│   │   ├── models/      # SQLAlchemy models
│   │   ├── services/    # Business logic
│   │   └── tasks/       # Celery async tasks
│   └── tests/           # pytest tests
│
├── dashboard/           # Web dashboard (React + Vite)
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   └── api/         # API client
│   └── dist/            # Production build
│
├── docs/                # Technical documentation
├── design_docs/         # Product specifications
└── .claude/             # Agent configuration and memory
```

---

## Running Tests

### Backend Tests
```bash
cd backend
source venv/bin/activate
pytest                           # All tests
pytest tests/unit/               # Unit tests only
pytest tests/integration/        # Integration tests only
pytest -v --tb=short            # Verbose with short tracebacks
```

### Extension Tests
```bash
cd extension
npm test                        # All tests
npm test -- --watch            # Watch mode
npm test -- --coverage         # With coverage report
```

### Dashboard Tests
```bash
cd dashboard
npm test                        # All tests
npm test -- --coverage         # With coverage report
```

---

## Core Technologies

| Component | Technology |
|-----------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, Zustand |
| **Backend** | FastAPI, SQLAlchemy, Celery, Redis |
| **Database** | SQLite (dev), PostgreSQL (production) |
| **AI** | Anthropic Claude 3.5 Sonnet |
| **Storage** | AWS S3 (or local filesystem) |
| **Auth** | JWT with bcrypt |

---

## Development Workflow

1. Check `.claude/backlog.md` for prioritized tasks
2. Create feature branch: `git checkout -b feature/TICKET-description`
3. Implement with tests
4. Run test suite before committing
5. Update documentation if API changes
6. Submit PR for review
