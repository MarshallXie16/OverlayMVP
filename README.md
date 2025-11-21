# Workflow Automation Platform

AI-powered Chrome extension for recording, managing, and executing interactive web workflows.

## 📚 Documentation

- **[Quick Start Guide](./QUICKSTART.md)** - Get running in 5 minutes ⚡
- **[Testing Guide](./TESTING_GUIDE.md)** - Comprehensive testing scenarios 🧪
- **[Extension Docs](./extension/README.md)** - Chrome extension documentation
- **[Dashboard Docs](./dashboard/README.md)** - Web dashboard documentation

## 🎯 Current Status

**Sprint 1 Complete** ✅ (53 Story Points)

- ✅ Backend API with authentication and workflow management
- ✅ Chrome extension with recording capabilities
- ✅ Web dashboard with workflow viewing
- ✅ ~7,900 lines of production code
- ✅ 54 tests passing (100% pass rate)

**Next**: Sprint 2 - AI labeling, walkthrough mode, enhanced testing

## Quick Start

**For detailed step-by-step instructions, see [QUICKSTART.md](./QUICKSTART.md)**

### Prerequisites
- **Node.js** 18+ and npm
- **Python** 3.11+
- **Google Chrome** (for extension testing)

*Note: Redis and AWS S3 are not required for MVP testing*

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd OverlayMVP
```

2. **Install dependencies**
```bash
# Install all npm packages
npm install

# Set up Python virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **Configure environment variables**
```bash
# Copy example env file
cp .env.example .env

# Edit .env and fill in:
# - JWT_SECRET_KEY (generate a secure random key)
# - ANTHROPIC_API_KEY (from Anthropic Console)
# - AWS credentials for S3
# - Other configuration values
```

4. **Initialize the database**
```bash
cd backend
# Run migrations (once implemented)
alembic upgrade head
```

### Running the Development Environment

**Terminal 1: Backend API**
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
# Runs at http://localhost:8000
```

**Terminal 2: Web Dashboard**
```bash
cd dashboard
npm run dev
# Runs at http://localhost:3000
```

**Terminal 3: Chrome Extension** (one-time build)
```bash
cd extension
npm run build
# Builds to extension/dist/
```

Then load the extension in Chrome:
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist/` folder

### Verify Everything Works

1. **Backend**: http://localhost:8000/docs (Swagger UI)
2. **Dashboard**: http://localhost:3000 (Login page)
3. **Extension**: Click icon in Chrome toolbar (Popup UI)

**See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for complete end-to-end testing scenarios.**

---

## Project Structure

```
workflow-platform/
├── extension/           # Chrome extension (TypeScript + React)
├── backend/             # FastAPI server (Python)
├── dashboard/           # Web dashboard (React)
├── design_docs/         # Product specifications
├── memory.md            # Agent's project memory
├── tasks.md             # Current sprint tasks
└── README.md            # This file
```

See `memory.md` for detailed architecture documentation.

---

## Core Technologies

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand
- **Backend**: FastAPI, SQLAlchemy, Celery, Redis
- **Database**: SQLite (MVP) → PostgreSQL (production)
- **AI**: Anthropic Claude 3.5 Sonnet
- **Storage**: AWS S3
- **Auth**: JWT with bcrypt

---

## Development Workflow

1. Check `tasks.md` for current sprint tasks
2. Create feature branch: `feature/TICKET-XXX-description`
3. Implement following test-driven development
4. Update `memory.md` with new patterns/decisions
5. Run tests before committing
6. Update documentation as needed

---

## Documentation

- **`memory.md`** - Project architecture and decisions
- **`tasks.md`** - Current sprint plan
- **`design_docs/`** - Business and technical specifications
- **`docs/`** - Component and API documentation (to be created)

---

## Troubleshooting

### Backend won't start
- Ensure virtual environment is activated
- Check all environment variables in `.env`
- Verify Python version: `python --version` (should be 3.11+)

### Extension won't load
- Check for build errors: `npm run dev`
- Ensure manifest.json is in dist folder
- Check Chrome extension error logs

### Database errors
- Ensure migrations have run: `alembic upgrade head`
- Check DATABASE_URL in `.env`

---

## Contributing

See `agent.md` for the autonomous development workflow and standards.

---

## License

[To be determined]
