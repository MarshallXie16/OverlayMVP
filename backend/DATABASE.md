# Database Setup and Migrations

This document describes the database schema, migrations, and how to work with the database for the Workflow Automation Platform.

## Overview

- **ORM**: SQLAlchemy 2.0 with declarative models
- **Migration Tool**: Alembic
- **Database**: SQLite (MVP) - designed for easy migration to PostgreSQL

## Database Models

All models are located in `/home/user/OverlayMVP/packages/backend/app/models/`:

### Core Models

1. **Company** (`company.py`)
   - Multi-tenant root entity
   - Contains invite token for user signup
   - Settings stored as JSON text

2. **User** (`user.py`)
   - Authentication and authorization
   - Belongs to a company
   - Roles: admin, regular
   - Password stored as bcrypt hash

3. **Workflow** (`workflow.py`)
   - Recorded automation sequences
   - Status tracking (draft, processing, active, needs_review, broken, archived)
   - Success rate and failure metrics
   - Tags stored as JSON array

4. **Step** (`step.py`)
   - Individual actions in a workflow
   - Element selectors and metadata (stored as JSON)
   - AI-generated labels and instructions
   - Auto-healing tracking
   - Admin edit tracking

5. **Screenshot** (`screenshot.py`)
   - Workflow step screenshots
   - SHA-256 hash for deduplication
   - S3 storage information

6. **HealthLog** (`health_log.py`)
   - Execution tracking for workflows
   - Success/failure status
   - Auto-healing metrics
   - Performance data

7. **Notification** (`notification.py`)
   - Admin alerts about workflow health
   - Severity levels: info, warning, error
   - Read status tracking

## Multi-Tenancy

All models except `Company` and `User` include a `company_id` foreign key for data isolation. All queries must filter by `company_id` from the JWT token.

## Running Migrations

### Initial Setup

1. **Create virtual environment** (if not already created):
   ```bash
   cd /home/user/OverlayMVP/packages/backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run migrations**:
   ```bash
   # Apply all migrations to create the database
   alembic upgrade head
   ```

### Common Migration Commands

```bash
# Upgrade to latest migration
alembic upgrade head

# Downgrade to previous migration
alembic downgrade -1

# Downgrade to a specific revision
alembic downgrade <revision_id>

# Downgrade all migrations (drop all tables)
alembic downgrade base

# View current migration version
alembic current

# View migration history
alembic history

# Generate a new migration (after model changes)
alembic revision --autogenerate -m "Description of changes"
```

### Environment Variables

Set `DATABASE_URL` to override the default SQLite database location:

```bash
# Default (SQLite in current directory)
export DATABASE_URL="sqlite:///./app.db"

# Custom SQLite location
export DATABASE_URL="sqlite:////path/to/database.db"

# PostgreSQL (for production)
export DATABASE_URL="postgresql://user:password@localhost/dbname"
```

## Schema Overview

### Tables and Relationships

```
companies (1)
  ├── users (many)
  ├── workflows (many)
  ├── screenshots (many)
  └── notifications (many)

workflows (1)
  ├── steps (many, ordered by step_number)
  ├── screenshots (many)
  ├── health_logs (many)
  └── notifications (many)

steps (1)
  ├── screenshot (1, optional)
  └── health_logs (many)
```

### Foreign Key Cascades

- **ON DELETE CASCADE**: Deleting a parent deletes all children
  - Company → Users, Workflows, Screenshots, Notifications
  - Workflow → Steps, Screenshots, HealthLogs, Notifications
  - Step → HealthLogs

- **ON DELETE SET NULL**: Deleting a parent sets FK to NULL
  - User (created_by) → Workflow
  - User (edited_by) → Step
  - User (read_by) → Notification
  - Screenshot → Step
  - Step → HealthLog (step_id)

### Indexes

All foreign keys are indexed for query performance:
- `companies.invite_token` (unique)
- `users.email` (unique)
- `users.company_id`
- `workflows.company_id`, `workflows.status`, `workflows.created_by`
- `steps.workflow_id`, `steps.screenshot_id`
- `screenshots.hash` (unique), `screenshots.workflow_id`
- `health_logs.workflow_id + created_at`, `health_logs.status`
- `notifications.company_id + read + created_at`

## Working with Models

### Example: Creating a Company and User

```python
from app.db.session import SessionLocal
from app.models import Company, User
import secrets

db = SessionLocal()

# Create company
company = Company(
    name="Acme Corp",
    invite_token=secrets.token_urlsafe(32),
    settings="{}"
)
db.add(company)
db.commit()

# Create admin user
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

user = User(
    company_id=company.id,
    email="admin@acme.com",
    password_hash=pwd_context.hash("secure_password"),
    name="Admin User",
    role="admin"
)
db.add(user)
db.commit()

db.close()
```

### Example: Querying Workflows

```python
from app.db.session import SessionLocal
from app.models import Workflow
from sqlalchemy import select

db = SessionLocal()

# Get all active workflows for a company
stmt = select(Workflow).where(
    Workflow.company_id == company_id,
    Workflow.status == "active"
).order_by(Workflow.created_at.desc())

workflows = db.execute(stmt).scalars().all()

db.close()
```

## Migration Files

- **Location**: `/home/user/OverlayMVP/packages/backend/alembic/versions/`
- **Current Migration**: `0acd3e6b9445_initial_schema_with_all_core_tables.py`

### Initial Migration Details

The initial migration (`0acd3e6b9445`) creates all 7 core tables with:
- All columns matching the technical specification
- All foreign key constraints with proper cascades
- All indexes for query optimization
- Proper SQLite compatibility (TEXT for JSON fields, batch mode for ALTER)

## SQLite Notes

### JSON Fields

JSON data is stored as TEXT in SQLite for compatibility. When migrating to PostgreSQL, these will become JSONB columns:
- `companies.settings`
- `workflows.tags`
- `steps.selectors`, `steps.element_meta`, `steps.page_context`, `steps.action_data`, `steps.dom_context`, `steps.healed_selectors`

### Boolean Fields

Booleans are stored as INTEGER (0/1) in SQLite. PostgreSQL will use native BOOLEAN type.

### Timestamps

All timestamps use `DateTime(timezone=True)` which maps to:
- SQLite: TEXT in ISO 8601 format
- PostgreSQL: TIMESTAMP WITH TIME ZONE

## Troubleshooting

### Migration Fails

If a migration fails:

```bash
# Check current migration status
alembic current

# View migration history
alembic history

# Manually rollback if needed
alembic downgrade -1
```

### Database Locked

SQLite doesn't handle concurrent writes well. If you get "database is locked":
- Ensure no other processes are accessing the database
- Consider using PostgreSQL for production

### Schema Mismatch

If models don't match the database:

```bash
# Generate a new migration to fix differences
alembic revision --autogenerate -m "Fix schema mismatch"

# Review the generated migration before applying
# Edit if needed, then apply
alembic upgrade head
```

## Next Steps

After setting up the database:

1. **Implement Authentication** (BE-002): Signup/login endpoints
2. **Create API Endpoints** (BE-004): Workflow CRUD operations
3. **Add Screenshot Upload** (BE-005): S3 integration
4. **Background Jobs** (Sprint 2): AI labeling with Celery

## References

- SQLAlchemy 2.0 Documentation: https://docs.sqlalchemy.org/en/20/
- Alembic Documentation: https://alembic.sqlalchemy.org/
- Technical Requirements: `/home/user/OverlayMVP/design_docs/technical_requirements.md`
