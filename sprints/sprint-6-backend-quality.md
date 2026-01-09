# Sprint 6: Backend Quality

**Duration**: 3-4 weeks
**Focus**: Error standardization, code refactoring, email service setup
**Prerequisites**: Sprint 5 (Team & Settings) completed

---

## Sprint Goal

Improve backend code quality by standardizing error responses, extracting duplicate code, and setting up email notifications for critical alerts.

---

## Tickets (8 items)

### NEW: BUG-003: Fix Deprecated datetime.utcnow() Usage

**Priority**: P2 (Medium)
**Component**: Backend
**Estimated Effort**: 1 hour
**Source**: Copilot Review Issue #1

#### Problem

`datetime.utcnow()` is deprecated in Python 3.12+ and returns naive datetime (no timezone info).

**File**: `backend/app/utils/jwt.py` (lines 44-46)

**Current Code**:
```python
if expires_delta:
    expire = datetime.utcnow() + expires_delta
else:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
```

**Fix**:
```python
from datetime import datetime, timezone

if expires_delta:
    expire = datetime.now(timezone.utc) + expires_delta
else:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
```

#### Acceptance Criteria
- [ ] All `datetime.utcnow()` replaced with `datetime.now(timezone.utc)`
- [ ] Consistent with `backend/app/services/auth.py` line 89 (already correct)
- [ ] Tests pass

---

### NEW: BUG-004: Fix AI Service Cost Estimation Pricing

**Priority**: P2 (Medium - affects cost tracking accuracy)
**Component**: Backend
**Estimated Effort**: 30 minutes
**Source**: Copilot Review Issue #3

#### Problem

`_estimate_cost()` documents Claude 3.5 Sonnet pricing but code uses `claude-haiku-4-5-20251001`. Cost estimates are ~3x inflated.

**File**: `backend/app/services/ai.py` (lines 369-386)

**Current Code**:
```python
def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
    """
    Claude 3.5 Sonnet pricing (as of 2024):
    - Input:  $3.00 per 1M tokens
    - Output: $15.00 per 1M tokens
    """
    input_cost = (input_tokens / 1_000_000) * 3.00
    output_cost = (output_tokens / 1_000_000) * 15.00
```

**Fix**:
```python
def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
    """
    Claude Haiku 4.5 pricing (as of 2024):
    - Input:  $1.00 per 1M tokens
    - Output: $5.00 per 1M tokens

    Note: Update if model changes.
    """
    input_cost = (input_tokens / 1_000_000) * 1.00
    output_cost = (output_tokens / 1_000_000) * 5.00
```

#### Acceptance Criteria
- [ ] Pricing updated to match actual model (Haiku 4.5)
- [ ] Docstring updated
- [ ] Cost logs will now show accurate estimates

---

### 1. REFACTOR-005: Standardize Backend Error Response Format

**Priority**: P2 (Medium)
**Component**: Backend
**Estimated Effort**: 2-3 days

#### Current State

Error responses mix different formats across endpoints:
- Some use: `{"code": "ERROR_CODE", "message": "..."}`
- Some use: `detail="error message"` (flat string)
- Some include `status_code`, others rely on HTTP status

#### Examples of Inconsistency

```python
# backend/app/api/auth.py:84-87 - Nested format
raise HTTPException(
    status_code=401,
    detail={"code": "INVALID_CREDENTIALS", "message": "Invalid email or password"}
)

# backend/app/api/steps.py:180 - Simple string
raise HTTPException(
    status_code=404,
    detail=f"Step {step_id} not found"
)
```

#### Implementation

**Step 1: Create Error Response Schema**

File: `backend/app/core/errors.py`

```python
from fastapi import HTTPException
from typing import Optional, Dict, Any

class ErrorCode:
    """Standard error codes."""
    # Auth
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"

    # Resources
    NOT_FOUND = "NOT_FOUND"
    ALREADY_EXISTS = "ALREADY_EXISTS"
    CONFLICT = "CONFLICT"

    # Validation
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_INPUT = "INVALID_INPUT"

    # Business Logic
    CANNOT_DELETE_LAST_STEP = "CANNOT_DELETE_LAST_STEP"
    WORKFLOW_NOT_READY = "WORKFLOW_NOT_READY"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Server
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


class AppError(HTTPException):
    """Application error with standardized format."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            status_code=status_code,
            detail={
                "error": {
                    "code": code,
                    "message": message,
                    "details": details or {}
                }
            }
        )


# Convenience functions
def not_found(resource: str, id: str = None) -> AppError:
    message = f"{resource} not found"
    if id:
        message = f"{resource} with id '{id}' not found"
    return AppError(404, ErrorCode.NOT_FOUND, message, {"resource": resource, "id": id})


def unauthorized(message: str = "Authentication required") -> AppError:
    return AppError(401, ErrorCode.UNAUTHORIZED, message)


def forbidden(message: str = "You don't have permission to perform this action") -> AppError:
    return AppError(403, ErrorCode.FORBIDDEN, message)


def bad_request(code: str, message: str, details: Dict = None) -> AppError:
    return AppError(400, code, message, details)


def conflict(message: str, details: Dict = None) -> AppError:
    return AppError(409, ErrorCode.CONFLICT, message, details)


def internal_error(message: str = "An unexpected error occurred") -> AppError:
    return AppError(500, ErrorCode.INTERNAL_ERROR, message)
```

**Step 2: Create Exception Handler**

File: `backend/app/core/exception_handler.py`

```python
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.core.errors import ErrorCode
import logging

logger = logging.getLogger(__name__)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors with standard format."""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": ".".join(str(loc) for loc in error["loc"][1:]),  # Skip 'body'
            "message": error["msg"],
            "type": error["type"]
        })

    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": ErrorCode.VALIDATION_ERROR,
                "message": "Validation failed",
                "details": {"errors": errors}
            }
        }
    )


async def generic_exception_handler(request: Request, exc: Exception):
    """Handle unexpected errors."""
    logger.exception("Unhandled exception", exc_info=exc)

    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": ErrorCode.INTERNAL_ERROR,
                "message": "An unexpected error occurred",
                "details": {}
            }
        }
    )
```

**Step 3: Register Handlers**

File: `backend/app/main.py`

```python
from fastapi.exceptions import RequestValidationError
from app.core.exception_handler import validation_exception_handler, generic_exception_handler

app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)
```

**Step 4: Update All Endpoints**

Example migrations:

```python
# Before (auth.py)
raise HTTPException(status_code=401, detail="Invalid credentials")

# After
from app.core.errors import bad_request, ErrorCode
raise bad_request(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password")


# Before (steps.py)
raise HTTPException(status_code=404, detail=f"Step {step_id} not found")

# After
from app.core.errors import not_found
raise not_found("Step", step_id)


# Before (workflows.py)
raise HTTPException(status_code=400, detail="Cannot delete last step")

# After
raise bad_request(
    ErrorCode.CANNOT_DELETE_LAST_STEP,
    "Cannot delete the last step. Delete the workflow instead."
)
```

#### Files to Create/Modify
- `backend/app/core/errors.py` - Create new file
- `backend/app/core/exception_handler.py` - Create new file
- `backend/app/main.py` - Register handlers
- `backend/app/api/auth.py` - Update errors
- `backend/app/api/workflows.py` - Update errors
- `backend/app/api/steps.py` - Update errors
- `backend/app/api/companies.py` - Update errors

#### Acceptance Criteria
- [ ] Error response schema defined and documented
- [ ] All endpoints use consistent format
- [ ] Validation errors include field-level details
- [ ] Generic exception handler catches unexpected errors
- [ ] Frontend can parse errors consistently
- [ ] API documentation updated (OpenAPI schema)

---

### 2. REFACTOR-006: Extract Duplicate Step-to-Response Logic

**Priority**: P2 (Medium)
**Component**: Backend
**Estimated Effort**: 1 day

#### Current State

Code that converts Step models to StepResponse is duplicated in three endpoints:
- `get_workflow_endpoint` (lines 204-234)
- `update_workflow_endpoint` (lines 309-337)
- `reorder_steps_endpoint` (lines 451-480)

Each performs identical JSON parsing of 17+ fields.

#### Implementation

File: `backend/app/services/step_mapper.py`

```python
from typing import List, Optional
import json
from app.models.step import Step
from app.schemas.step import StepResponse


def step_to_response(step: Step) -> StepResponse:
    """Convert Step model to StepResponse with JSON field parsing."""

    def parse_json_field(value: Optional[str], default=None):
        """Safely parse JSON string fields."""
        if value is None:
            return default
        try:
            return json.loads(value) if isinstance(value, str) else value
        except json.JSONDecodeError:
            return default

    return StepResponse(
        id=str(step.id),
        workflow_id=str(step.workflow_id),
        order_index=step.order_index,
        action_type=step.action_type,
        target_url=step.target_url,
        target_selector=step.target_selector,
        target_xpath=step.target_xpath,
        target_text=step.target_text,
        target_attributes=parse_json_field(step.target_attributes, {}),
        target_position=parse_json_field(step.target_position, {}),
        element_screenshot_path=step.element_screenshot_path,
        full_page_screenshot_path=step.full_page_screenshot_path,
        ai_label=step.ai_label,
        ai_description=step.ai_description,
        manual_label=step.manual_label,
        manual_description=step.manual_description,
        input_value=step.input_value,
        scroll_position=parse_json_field(step.scroll_position, {}),
        viewport_size=parse_json_field(step.viewport_size, {}),
        timestamp=step.timestamp.isoformat() if step.timestamp else None,
        created_at=step.created_at.isoformat() if step.created_at else None,
        updated_at=step.updated_at.isoformat() if step.updated_at else None,
    )


def steps_to_response(steps: List[Step]) -> List[StepResponse]:
    """Convert list of Step models to StepResponse list."""
    return [step_to_response(step) for step in steps]
```

**Update Endpoints**:

```python
# In backend/app/api/workflows.py

from app.services.step_mapper import step_to_response, steps_to_response

@router.get("/{workflow_id}")
async def get_workflow_endpoint(...):
    # ...
    steps = db.query(Step).filter(...).all()
    return WorkflowResponse(
        # ... other fields
        steps=steps_to_response(steps)
    )

@router.put("/{workflow_id}")
async def update_workflow_endpoint(...):
    # ...
    return WorkflowResponse(
        # ... other fields
        steps=steps_to_response(workflow.steps)
    )

@router.post("/{workflow_id}/reorder")
async def reorder_steps_endpoint(...):
    # ...
    return {"steps": steps_to_response(reordered_steps)}
```

#### Acceptance Criteria
- [ ] `step_mapper.py` service created
- [ ] All three endpoints use shared function
- [ ] No functional changes (responses identical)
- [ ] Tests pass
- [ ] Code duplication eliminated (~90 lines saved)

---

### 3. FEAT-015: Email Notifications for Workflow Alerts

**Priority**: P1 (High)
**Component**: Backend
**Estimated Effort**: 3-4 days

#### Current State

When workflows break, admins only see in-app notifications (which may not be seen immediately). Critical alerts should also go via email.

#### Implementation

**Step 1: Install Resend SDK**

```bash
cd backend
pip install resend
pip freeze > requirements.txt
```

**Step 2: Create Email Service**

File: `backend/app/services/email.py`

```python
import resend
import os
from typing import List, Optional
from jinja2 import Environment, FileSystemLoader
import logging

logger = logging.getLogger(__name__)

# Initialize Resend
resend.api_key = os.getenv("RESEND_API_KEY")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@overlay.app")
EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "true").lower() == "true"

# Template environment
template_env = Environment(
    loader=FileSystemLoader("app/templates/email"),
    autoescape=True
)


class EmailService:
    """Service for sending transactional emails."""

    @staticmethod
    def send_email(
        to: List[str],
        subject: str,
        html: str,
        text: Optional[str] = None
    ) -> bool:
        """Send an email using Resend."""
        if not EMAIL_ENABLED:
            logger.info(f"Email disabled. Would send to {to}: {subject}")
            return True

        if not resend.api_key:
            logger.warning("RESEND_API_KEY not configured, skipping email")
            return False

        try:
            resend.Emails.send({
                "from": EMAIL_FROM,
                "to": to,
                "subject": subject,
                "html": html,
                "text": text
            })
            logger.info(f"Email sent to {to}: {subject}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    @classmethod
    def send_workflow_broken_alert(
        cls,
        admin_emails: List[str],
        workflow_name: str,
        workflow_id: str,
        failure_count: int,
        last_error: str,
        dashboard_url: str
    ) -> bool:
        """Send alert when workflow is marked as broken."""
        template = template_env.get_template("workflow_broken.html")
        html = template.render(
            workflow_name=workflow_name,
            workflow_id=workflow_id,
            failure_count=failure_count,
            last_error=last_error,
            dashboard_url=dashboard_url,
            workflow_url=f"{dashboard_url}/workflows/{workflow_id}"
        )

        return cls.send_email(
            to=admin_emails,
            subject=f"⚠️ Workflow Alert: {workflow_name} needs attention",
            html=html
        )

    @classmethod
    def send_workflow_ready(
        cls,
        user_email: str,
        workflow_name: str,
        workflow_id: str,
        dashboard_url: str
    ) -> bool:
        """Send notification when AI labeling completes."""
        template = template_env.get_template("workflow_ready.html")
        html = template.render(
            workflow_name=workflow_name,
            workflow_url=f"{dashboard_url}/workflows/{workflow_id}"
        )

        return cls.send_email(
            to=[user_email],
            subject=f"✅ Workflow Ready: {workflow_name}",
            html=html
        )
```

**Step 3: Create Email Templates**

File: `backend/app/templates/email/workflow_broken.html`

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #EF4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
        .footer { margin-top: 20px; font-size: 12px; color: #6B7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Workflow Alert</h1>
        </div>
        <div class="content">
            <h2>{{ workflow_name }} needs attention</h2>
            <p>This workflow has failed <strong>{{ failure_count }}</strong> times in a row and has been marked as <strong>broken</strong>.</p>

            <p><strong>Last error:</strong></p>
            <pre style="background: #fff; padding: 12px; border-radius: 4px; overflow-x: auto;">{{ last_error }}</pre>

            <a href="{{ workflow_url }}" class="button">View Workflow</a>
        </div>
        <div class="footer">
            <p>You're receiving this because you're an admin of this workspace.</p>
            <p><a href="{{ dashboard_url }}/settings/notifications">Manage notification preferences</a></p>
        </div>
    </div>
</body>
</html>
```

File: `backend/app/templates/email/workflow_ready.html`

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Workflow Ready</h1>
        </div>
        <div class="content">
            <h2>{{ workflow_name }} is ready for review</h2>
            <p>AI labeling has completed. Your workflow is now ready to review and activate.</p>

            <a href="{{ workflow_url }}" class="button">Review Workflow</a>
        </div>
    </div>
</body>
</html>
```

**Step 4: Integrate with Health Service**

File: `backend/app/services/health.py`

```python
from app.services.email import EmailService

def mark_workflow_broken(db: Session, workflow: Workflow, error: str):
    """Mark workflow as broken and notify admins."""
    workflow.status = "broken"
    workflow.consecutive_failures = 3  # or whatever threshold
    db.commit()

    # Get admin emails
    admins = db.query(User).filter(
        User.company_id == workflow.company_id,
        User.role == "admin"
    ).all()
    admin_emails = [a.email for a in admins]

    # Send email notification
    dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000")
    EmailService.send_workflow_broken_alert(
        admin_emails=admin_emails,
        workflow_name=workflow.name,
        workflow_id=str(workflow.id),
        failure_count=workflow.consecutive_failures,
        last_error=error,
        dashboard_url=dashboard_url
    )
```

**Step 5: Add Environment Variables**

File: `backend/.env.example`

```env
# Email Configuration
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@yourapp.com
EMAIL_ENABLED=true  # Set to false for local development
DASHBOARD_URL=http://localhost:3000
```

#### Files to Create/Modify
- `backend/app/services/email.py` - Create email service
- `backend/app/templates/email/` - Create template directory
- `backend/app/templates/email/workflow_broken.html` - Create template
- `backend/app/templates/email/workflow_ready.html` - Create template
- `backend/app/services/health.py` - Integrate email on broken workflow
- `backend/app/tasks/ai_labeling.py` - Integrate email on completion
- `backend/.env.example` - Add email variables
- `backend/requirements.txt` - Add resend

#### Acceptance Criteria
- [ ] Resend SDK installed and configured
- [ ] Email service with template support
- [ ] Broken workflow alert emails to admin(s)
- [ ] Email template with workflow name, link, failure details
- [ ] Rate limiting (max 1 email per workflow per hour) - optional for MVP
- [ ] Test mode for development (EMAIL_ENABLED=false)
- [ ] Error logging if email fails

---

### 4. DOC-003: Complete API Documentation

**Priority**: P2 (Medium)
**Component**: Backend
**Estimated Effort**: 2 days

#### Current State

Only auth and healing endpoints are documented in `backend/API_EXAMPLES.md`. Major endpoints are missing.

#### Missing Endpoints to Document

1. **Workflow CRUD**
   - `GET /api/workflows` - List workflows
   - `GET /api/workflows/{id}` - Get workflow details
   - `POST /api/workflows` - Create workflow
   - `PUT /api/workflows/{id}` - Update workflow
   - `DELETE /api/workflows/{id}` - Delete workflow

2. **Step Management**
   - `GET /api/steps/{id}` - Get step
   - `PUT /api/steps/{id}` - Update step
   - `DELETE /api/steps/{id}` - Delete step
   - `POST /api/workflows/{id}/reorder` - Reorder steps

3. **Screenshots**
   - `POST /api/screenshots/upload` - Upload screenshot
   - `GET /api/screenshots/{path}` - Get screenshot

4. **Health & Notifications**
   - `GET /api/health/logs` - Get health logs
   - `GET /api/health/stats` - Get health stats
   - `GET /api/notifications` - List notifications
   - `PATCH /api/notifications/{id}` - Mark as read

5. **Users & Companies**
   - `GET /api/users/me` - Get profile
   - `PATCH /api/users/me` - Update profile
   - `GET /api/companies/me/members` - List members
   - `DELETE /api/companies/me/members/{id}` - Remove member

#### Template for Each Endpoint

```markdown
### Endpoint Name

**Endpoint**: `METHOD /api/path`
**Auth**: Required (Bearer token)
**Description**: What this endpoint does

**Request**:
```json
{
  "field": "value"
}
```

**Query Parameters** (if applicable):
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | int | No | Page number (default: 1) |

**Response** (200 OK):
```json
{
  "data": {}
}
```

**Errors**:
| Code | Description |
|------|-------------|
| 404 | Resource not found |
| 403 | Not authorized |
```

#### Acceptance Criteria
- [ ] All endpoints documented with examples
- [ ] Query parameters and pagination documented
- [ ] Error response formats included
- [ ] Authentication requirements clear
- [ ] Request/response examples accurate

---

### 5. DOC-004: Create Deployment Guide

**Priority**: P2 (Medium)
**Component**: Root
**Estimated Effort**: 1-2 days

#### Content to Include

File: `docs/DEPLOYMENT.md`

```markdown
# Deployment Guide

## Overview

This guide covers deploying the Workflow Automation Platform to production.

## Prerequisites

- AWS account (or equivalent cloud provider)
- Domain name with SSL certificate
- PostgreSQL database (AWS RDS recommended)
- Redis instance (AWS ElastiCache recommended)
- S3 bucket for screenshots

## Architecture

[Diagram placeholder]

- **Backend**: FastAPI on AWS ECS/Fargate or EC2
- **Dashboard**: Static React app on S3 + CloudFront
- **Extension**: Chrome Web Store
- **Database**: PostgreSQL on RDS
- **Queue**: Redis on ElastiCache
- **Storage**: S3 for screenshots

## Environment Variables

### Backend (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@host:5432/db |
| JWT_SECRET_KEY | Secret for JWT signing | (generate with secrets.token_urlsafe(32)) |
| REDIS_URL | Redis connection string | redis://host:6379 |
| ANTHROPIC_API_KEY | Claude API key | sk-ant-... |
| AWS_ACCESS_KEY_ID | AWS access key | AKIA... |
| AWS_SECRET_ACCESS_KEY | AWS secret key | ... |
| AWS_S3_BUCKET | S3 bucket name | overlay-screenshots |
| AWS_S3_REGION | S3 region | us-east-1 |

### Backend (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| RESEND_API_KEY | Email service key | (disabled if not set) |
| EMAIL_FROM | Sender email | noreply@overlay.app |
| CORS_ORIGINS | Allowed origins | http://localhost:3000 |

### Dashboard

| Variable | Description | Example |
|----------|-------------|---------|
| VITE_API_URL | Backend API URL | https://api.overlay.app |

## Deployment Steps

### 1. Database Setup

...

### 2. Backend Deployment

...

### 3. Dashboard Deployment

...

### 4. Extension Publishing

...

## Monitoring

...

## Rollback Procedures

...

## Security Checklist

- [ ] All secrets in environment variables, not code
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] CORS configured correctly
- [ ] Database backups configured
- [ ] Monitoring/alerting set up
```

#### Acceptance Criteria
- [ ] Complete deployment checklist
- [ ] Environment variable reference
- [ ] Security checklist included
- [ ] Rollback procedures documented
- [ ] Clear step-by-step instructions

---

### 6. PERF-002: Add Composite Database Indexes

**Priority**: P2 (Medium)
**Component**: Backend
**Estimated Effort**: 0.5 days

#### Current State

Missing composite indexes for common query patterns will cause performance issues at scale.

#### Current Indexes

```python
# backend/app/models/workflow.py
Index("idx_workflows_company", "company_id"),
Index("idx_workflows_status", "status"),

# backend/app/models/step.py
Index("idx_steps_workflow", "workflow_id"),
```

#### Missing Indexes

```python
# For "get all active workflows for company sorted by updated"
Index("idx_workflows_company_status", "company_id", "status"),
Index("idx_workflows_company_updated", "company_id", "updated_at"),

# For health trending queries
Index("idx_health_logs_workflow_created", "workflow_id", "created_at"),
```

#### Implementation

**Step 1: Create Migration**

```bash
cd backend
alembic revision -m "add_composite_indexes"
```

File: `backend/alembic/versions/xxx_add_composite_indexes.py`

```python
"""add composite indexes

Revision ID: xxx
"""
from alembic import op

def upgrade():
    op.create_index(
        "idx_workflows_company_status",
        "workflows",
        ["company_id", "status"]
    )
    op.create_index(
        "idx_workflows_company_updated",
        "workflows",
        ["company_id", "updated_at"]
    )
    op.create_index(
        "idx_health_logs_workflow_created",
        "health_logs",
        ["workflow_id", "created_at"]
    )

def downgrade():
    op.drop_index("idx_workflows_company_status", "workflows")
    op.drop_index("idx_workflows_company_updated", "workflows")
    op.drop_index("idx_health_logs_workflow_created", "health_logs")
```

**Step 2: Run Migration**

```bash
alembic upgrade head
```

#### Acceptance Criteria
- [ ] Migration created
- [ ] Indexes added to database
- [ ] Query performance verified with EXPLAIN
- [ ] No regression in existing functionality

---

## Sprint Execution Checklist

### Before Starting
- [ ] Sprint 5 (Team & Settings) completed
- [ ] All tests passing
- [ ] Review this sprint plan

### During Sprint
- [ ] Update sprint.md with daily progress
- [ ] Commit after each ticket
- [ ] Test email locally with EMAIL_ENABLED=false

### Before Completing
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] API documentation complete
- [ ] Error responses standardized
- [ ] Migration tested

---

## Verification Commands

```bash
# Check error response format
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bad@email","password":"short"}' | jq

# Verify indexes
psql -d overlay -c "\di"

# Test email (with EMAIL_ENABLED=true and valid RESEND_API_KEY)
python -c "from app.services.email import EmailService; EmailService.send_email(['test@example.com'], 'Test', '<p>Test</p>')"
```

---

## Completion Criteria

Sprint is complete when:
1. All error responses follow standard format
2. Step-to-response logic extracted and shared
3. Email service working (at least in test mode)
4. API documentation complete
5. Deployment guide created
6. Database indexes added
7. All tests pass
