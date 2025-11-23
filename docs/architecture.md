# System Architecture

## Overview

Workflow automation platform with Chrome extension, React dashboard, and FastAPI backend.

---

## Component Interaction

```
┌─────────────────┐
│  Chrome Browser │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Extension │
    └────┬─────┘
         │
    ┌────▼──────────────┬────────────────┐
    │                   │                │
┌───▼────┐     ┌───────▼──────┐  ┌─────▼──────┐
│ Popup  │     │ Content Script│  │ Background │
│  (UI)  │     │   (Recorder)  │  │  (Worker)  │
└───┬────┘     └───────┬──────┘  └─────┬──────┘
    │                  │                │
    └──────────────────┴────────────────┘
                       │
                  ┌────▼────┐
                  │  Backend│
                  │   API   │
                  └────┬────┘
                       │
              ┌────────┴────────┐
              │                 │
         ┌────▼────┐      ┌────▼────┐
         │Database │      │Dashboard│
         │(SQLite) │      │ (React) │
         └─────────┘      └─────────┘
```

---

## Extension Architecture

### **Popup** (`extension/src/popup/`)
- React UI for extension controls
- Start/stop recording
- View recording state
- Authentication

### **Content Script** (`extension/src/content/`)
- Injected into web pages
- Captures user interactions
- Shows recording widget
- Stores steps in IndexedDB

**Key Files:**
- `recorder.ts` - Main recording logic
- `widget.ts` - Recording UI overlay
- `utils/event-deduplicator.ts` - Event grouping
- `utils/filters.ts` - Interaction filtering
- `storage/indexeddb.ts` - Local storage

### **Background Worker** (`extension/src/background/`)
- Service worker (persistent)
- Routes messages between components
- Captures screenshots
- Uploads workflows to backend

**Key Files:**
- `index.ts` - Entry point, lifecycle
- `messaging.ts` - Message routing
- `state.ts` - Recording state management

---

## Backend Architecture

### **API** (`backend/app/`)
- FastAPI framework
- RESTful endpoints
- JWT authentication
- CORS enabled

**Key Endpoints:**
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/workflows` - Create workflow
- `GET /api/workflows` - List workflows
- `GET /api/workflows/{id}` - Get workflow details
- `POST /api/screenshots` - Upload screenshot

### **Database** (`backend/workflow_db.db`)
- SQLite with SQLAlchemy ORM
- Tables: users, companies, workflows, steps, screenshots

**Schema:**
```
users (id, email, password_hash, company_id)
  └─> workflows (id, name, user_id, status)
       └─> steps (id, workflow_id, step_number, action_type, selectors, ...)
            └─> screenshots (id, workflow_id, data, mime_type)
```

---

## Dashboard Architecture

### **Frontend** (`dashboard/src/`)
- React + TypeScript
- Vite build tool
- TailwindCSS styling
- React Router navigation

**Key Pages:**
- `/login` - Authentication
- `/signup` - Registration
- `/dashboard` - Workflow list
- `/workflows/:id` - Workflow details

---

## Data Flow

### **Recording Flow:**
```
1. User clicks "Start Recording" in popup
2. Popup sends message to background worker
3. Background injects content script into active tab
4. Content script starts event listeners
5. User interacts with page
6. Events captured and deduplicated
7. Steps stored in IndexedDB with screenshots
8. User clicks "Stop" 
9. Content script sends data to background
10. Background uploads to backend API
11. Backend stores in database
12. Dashboard displays workflow
```

### **Playback Flow (Future):**
```
1. User selects workflow in dashboard
2. Dashboard sends to extension
3. Extension opens target URL
4. Executes steps sequentially
5. Reports success/failure
```

---

## Technology Stack

### **Extension:**
- TypeScript
- Vite
- IndexedDB
- Chrome Extension APIs

### **Backend:**
- Python 3.11
- FastAPI
- SQLAlchemy
- SQLite
- JWT auth

### **Dashboard:**
- React 18
- TypeScript
- Vite
- TailwindCSS
- React Router

---

## Key Design Decisions

### **1. Chrome Extension Architecture**
- **Manifest V3** - Latest standard, service workers
- **Content Script Isolation** - Separate from page context
- **IndexedDB for Storage** - Persistent, handles large data

### **2. Event Deduplication**
- **100ms buffering** - Groups related events
- **Priority system** - Picks most semantic event
- **Value tracking** - Detects actual changes

### **3. SQLite Database**
- **Simple deployment** - Single file
- **Good performance** - Sufficient for MVP
- **Easy migration** - Can move to PostgreSQL later

### **4. JWT Authentication**
- **Stateless** - No session storage needed
- **Secure** - Token-based
- **Cross-origin** - Works with extension + dashboard

---

## Security

### **Authentication:**
- Passwords hashed with bcrypt
- JWT tokens with expiration
- HTTPS required in production

### **Authorization:**
- User can only access their own workflows
- Company-level isolation
- Admin roles (future)

### **Data Privacy:**
- Screenshots stored securely
- Sensitive data not logged
- User consent required

---

## Scalability Considerations

### **Current (MVP):**
- Single server
- SQLite database
- Local file storage
- ~100 concurrent users

### **Future:**
- Load balancer
- PostgreSQL cluster
- S3 for screenshots
- Redis cache
- ~10,000+ concurrent users

---

## Development Workflow

### **Local Development:**
```bash
# Backend
cd backend && uvicorn app.main:app --reload

# Dashboard
cd dashboard && npm run dev

# Extension
cd extension && npm run build
# Load unpacked in chrome://extensions/
```

### **Testing:**
```bash
# Backend tests
cd backend && pytest

# Extension tests
cd extension && npm test

# E2E tests
cd tests && npm run test:e2e
```

---

## Monitoring (Future)

- Error tracking (Sentry)
- Performance monitoring
- User analytics
- Logging aggregation

---

## Deployment (Future)

### **Backend:**
- Docker container
- AWS/GCP/Azure
- CI/CD pipeline
- Auto-scaling

### **Dashboard:**
- Static hosting (Netlify/Vercel)
- CDN distribution
- Auto-deployment from main branch

### **Extension:**
- Chrome Web Store
- Auto-update on new release
- Version management
