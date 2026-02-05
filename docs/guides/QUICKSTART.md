# Quick Start Guide

Get the Workflow Automation Platform running in 5 minutes.

## Prerequisites

- Python 3.11+
- Node.js 18+
- Google Chrome

## Setup (One-time)

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env file
touch .env

# Edit these values:
# JWT_SECRET_KEY - REQUIRED: Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
# ANTHROPIC_API_KEY - REQUIRED for AI labeling: Get from https://console.anthropic.com
# REDIS_URL - REQUIRED for Celery: redis://localhost:6379 (or your Redis URL)
# AWS_* - OPTIONAL: For S3 screenshot storage (uses local filesystem if not set)

# Initialize database
alembic upgrade head
```

### 2. Dashboard Setup

```bash
cd dashboard
npm install
```

### 3. Extension Setup

```bash
cd extension
npm install
npm run build
```

**Load in Chrome:**
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist/` folder

## Running (Every Time)

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
uvicorn app.main:app --reload
```
→ Backend at http://localhost:8000

**Terminal 2 - Dashboard:**
```bash
cd dashboard
npm run dev
```
→ Dashboard at http://localhost:3000

## Quick Test

1. **Go to** http://localhost:3000
2. **Click** "create a new account"
3. **Fill in**:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
   - Company Name: Test Company (REQUIRED)
4. **Sign up** → You'll see the dashboard

5. **Click extension icon** in Chrome
6. **Login** with same credentials
7. **Go to** https://example.com
8. **Click extension** → "Start Recording"
9. **Click some links** on the page
10. **Click extension** → "Stop Recording"
11. **Refresh dashboard** → See your workflow!

## What You Should See

### Backend Terminal
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Dashboard (Browser)
- Login/Signup pages
- Dashboard with workflow list
- Workflow detail pages

### Extension (Chrome)
- Login form (when not logged in)
- Recording controls (when logged in)
- Workflow list

## Common Issues

**Backend won't start?**
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**Dashboard shows blank page?**
- Check if backend is running: http://localhost:8000/docs

**Extension doesn't work?**
- Rebuild: `cd extension && npm run build`
- Reload in chrome://extensions/

## Next Steps

For detailed testing scenarios, see [TESTING_GUIDE.md](./TESTING_GUIDE.md)

## Stop All Services

- Backend: `Ctrl+C` in terminal 1
- Dashboard: `Ctrl+C` in terminal 2
- Extension: Disable in chrome://extensions/
