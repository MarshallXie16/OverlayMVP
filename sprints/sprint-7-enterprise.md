# Sprint 7: Enterprise Features

**Duration**: 4-6 weeks
**Focus**: SSO/SAML integration and audit logging for enterprise customers
**Prerequisites**: Sprints 1-6 completed

---

## Sprint Goal

Add enterprise-grade features required for large organization adoption: Single Sign-On (SSO) via SAML/OIDC and comprehensive audit logging for compliance.

**Note**: This sprint has larger scope tickets. Consider splitting across multiple sessions if needed.

---

## Tickets (2 items)

### 1. FEAT-016: SSO/SAML Integration

**Priority**: P1 (High for Enterprise)
**Component**: Backend + Dashboard
**Estimated Effort**: 2-3 weeks

#### Description

Enterprise customers require Single Sign-On via SAML 2.0 or OIDC to integrate with their identity providers (Okta, Azure AD, Google Workspace).

#### Scope

- SAML 2.0 SP (Service Provider) implementation
- OIDC support (Google, Microsoft, Okta)
- JIT (Just-In-Time) user provisioning
- Mapping IdP groups to app roles

#### Implementation

**Step 1: Database Changes**

File: `backend/alembic/versions/xxx_add_sso_config.py`

```python
"""add SSO configuration table

Revision ID: xxx
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

def upgrade():
    op.create_table(
        "company_sso_configs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("company_id", UUID, sa.ForeignKey("companies.id"), nullable=False, unique=True),
        sa.Column("provider", sa.String(50), nullable=False),  # 'saml', 'oidc', 'google', 'microsoft', 'okta'
        sa.Column("enabled", sa.Boolean, default=False),
        sa.Column("metadata_url", sa.String(500)),  # SAML IdP metadata URL
        sa.Column("entity_id", sa.String(500)),  # SAML Entity ID
        sa.Column("sso_url", sa.String(500)),  # SAML SSO URL
        sa.Column("certificate", sa.Text),  # SAML X.509 certificate
        sa.Column("client_id", sa.String(255)),  # OIDC client ID
        sa.Column("client_secret", sa.String(500)),  # OIDC client secret (encrypted)
        sa.Column("issuer_url", sa.String(500)),  # OIDC issuer
        sa.Column("scopes", sa.String(255), default="openid profile email"),
        sa.Column("attribute_mapping", JSONB, default={}),  # Map IdP attrs to user fields
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, onupdate=sa.func.now()),
    )

def downgrade():
    op.drop_table("company_sso_configs")
```

**Step 2: SSO Configuration Model**

File: `backend/app/models/sso_config.py`

```python
from sqlalchemy import Column, String, Boolean, Text, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import Base
import uuid

class CompanySSOConfig(Base):
    __tablename__ = "company_sso_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, unique=True)
    provider = Column(String(50), nullable=False)
    enabled = Column(Boolean, default=False)

    # SAML fields
    metadata_url = Column(String(500))
    entity_id = Column(String(500))
    sso_url = Column(String(500))
    certificate = Column(Text)

    # OIDC fields
    client_id = Column(String(255))
    client_secret = Column(String(500))  # Should be encrypted
    issuer_url = Column(String(500))
    scopes = Column(String(255), default="openid profile email")

    # Common
    attribute_mapping = Column(JSON, default={})

    company = relationship("Company", back_populates="sso_config")
```

**Step 3: SSO Service**

File: `backend/app/services/sso.py`

```python
from typing import Optional, Dict, Any
import httpx
from authlib.integrations.starlette_client import OAuth
from app.models.sso_config import CompanySSOConfig
from app.models.user import User
from app.models.company import Company
import logging

logger = logging.getLogger(__name__)

class SSOService:
    """Service for handling SSO authentication."""

    def __init__(self):
        self.oauth = OAuth()

    async def initiate_sso(self, company_slug: str, db) -> str:
        """Start SSO flow and return redirect URL."""
        company = db.query(Company).filter(Company.slug == company_slug).first()
        if not company or not company.sso_config or not company.sso_config.enabled:
            raise ValueError("SSO not configured for this company")

        config = company.sso_config

        if config.provider == "saml":
            return self._initiate_saml(config)
        else:
            return await self._initiate_oidc(config)

    async def handle_callback(
        self,
        provider: str,
        callback_data: Dict[str, Any],
        db
    ) -> User:
        """Handle SSO callback and return/create user."""
        if provider == "saml":
            user_info = self._parse_saml_response(callback_data)
        else:
            user_info = await self._exchange_oidc_code(callback_data)

        # Find or create user (JIT provisioning)
        user = await self._provision_user(user_info, db)
        return user

    async def _provision_user(self, user_info: Dict, db) -> User:
        """Create or update user from SSO data (Just-In-Time provisioning)."""
        email = user_info.get("email")
        if not email:
            raise ValueError("Email not provided by identity provider")

        user = db.query(User).filter(User.email == email).first()

        if user:
            # Update existing user
            user.name = user_info.get("name", user.name)
            user.last_sso_login = datetime.utcnow()
        else:
            # Create new user
            company_id = user_info.get("company_id")
            user = User(
                email=email,
                name=user_info.get("name", email.split("@")[0]),
                company_id=company_id,
                role=user_info.get("role", "member"),
                hashed_password="",  # No password for SSO users
                is_sso_user=True
            )
            db.add(user)

        db.commit()
        db.refresh(user)
        return user

    def _initiate_saml(self, config: CompanySSOConfig) -> str:
        """Generate SAML AuthnRequest and return redirect URL."""
        # Implementation using python-saml or similar
        pass

    async def _initiate_oidc(self, config: CompanySSOConfig) -> str:
        """Generate OIDC authorization URL."""
        # Implementation using authlib
        pass

    def _parse_saml_response(self, response_data: Dict) -> Dict:
        """Parse and validate SAML response."""
        pass

    async def _exchange_oidc_code(self, callback_data: Dict) -> Dict:
        """Exchange OIDC code for tokens and get user info."""
        pass
```

**Step 4: SSO API Endpoints**

File: `backend/app/api/sso.py`

```python
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.services.sso import SSOService
from app.core.auth import create_access_token

router = APIRouter(prefix="/auth/sso", tags=["sso"])
sso_service = SSOService()

@router.get("/{company_slug}")
async def initiate_sso(
    company_slug: str,
    db: Session = Depends(get_db)
):
    """Initiate SSO login for a company."""
    try:
        redirect_url = await sso_service.initiate_sso(company_slug, db)
        return RedirectResponse(url=redirect_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/callback/saml")
async def saml_callback(
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle SAML callback (ACS endpoint)."""
    form_data = await request.form()
    user = await sso_service.handle_callback("saml", dict(form_data), db)

    # Create JWT token
    token = create_access_token(user)
    dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000")
    return RedirectResponse(url=f"{dashboard_url}/auth/callback?token={token}")

@router.get("/callback/oidc")
async def oidc_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db)
):
    """Handle OIDC callback."""
    user = await sso_service.handle_callback("oidc", {"code": code, "state": state}, db)

    token = create_access_token(user)
    dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000")
    return RedirectResponse(url=f"{dashboard_url}/auth/callback?token={token}")


# Admin endpoints for SSO configuration
@router.get("/config")
async def get_sso_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get SSO configuration for company."""
    config = db.query(CompanySSOConfig).filter(
        CompanySSOConfig.company_id == current_user.company_id
    ).first()

    if not config:
        return {"configured": False}

    return {
        "configured": True,
        "provider": config.provider,
        "enabled": config.enabled,
        # Don't expose sensitive fields like client_secret
    }

@router.put("/config")
async def update_sso_config(
    config_data: SSOConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update SSO configuration."""
    # Implementation
    pass
```

**Step 5: Dashboard SSO Admin UI**

File: `dashboard/src/pages/SSOSettings.tsx`

```typescript
import { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { showToast } from '@/utils/toast';

type SSOProvider = 'none' | 'google' | 'microsoft' | 'okta' | 'saml';

export function SSOSettings() {
  const [provider, setProvider] = useState<SSOProvider>('none');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state varies by provider
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await apiClient.get('/auth/sso/config');
      if (res.data.configured) {
        setProvider(res.data.provider);
        setConfig(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.put('/auth/sso/config', {
        provider,
        client_id: clientId,
        client_secret: clientSecret,
        metadata_url: metadataUrl,
        enabled: true,
      });
      showToast.success('SSO configuration saved');
    } catch (err) {
      showToast.error('Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Single Sign-On (SSO)</h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Provider</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value as SSOProvider)}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="none">None (Email/Password only)</option>
            <option value="google">Google Workspace</option>
            <option value="microsoft">Microsoft (Azure AD)</option>
            <option value="okta">Okta</option>
            <option value="saml">Custom SAML 2.0</option>
          </select>
        </div>

        {provider === 'google' && (
          <GoogleSSOForm
            clientId={clientId}
            setClientId={setClientId}
            clientSecret={clientSecret}
            setClientSecret={setClientSecret}
          />
        )}

        {provider === 'saml' && (
          <SAMLForm
            metadataUrl={metadataUrl}
            setMetadataUrl={setMetadataUrl}
          />
        )}

        {provider !== 'none' && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        )}
      </div>
    </div>
  );
}
```

#### Libraries Required

```bash
# Backend
pip install python-saml3  # or python3-saml
pip install authlib  # For OIDC
pip install cryptography  # For certificate handling
```

#### Acceptance Criteria
- [ ] SAML 2.0 SP-initiated login flow works
- [ ] OIDC flow for Google/Microsoft works
- [ ] User created on first SSO login (JIT provisioning)
- [ ] SSO config UI for admins
- [ ] Graceful fallback if SSO fails
- [ ] Security: Validate signatures, check assertions
- [ ] Tests for SSO flows

---

### 2. FEAT-017: Audit Logging

**Priority**: P1 (High for Enterprise)
**Component**: Backend
**Estimated Effort**: 1-2 weeks

#### Description

Enterprise customers need audit logs for compliance (SOC 2, HIPAA). Track who did what, when, from where.

#### Events to Log

| Category | Events |
|----------|--------|
| Auth | login, logout, login_failed, password_changed |
| User | user_created, user_invited, user_removed, role_changed |
| Workflow | workflow_created, workflow_updated, workflow_deleted, workflow_activated, workflow_deactivated |
| Step | step_created, step_updated, step_deleted |
| Walkthrough | walkthrough_started, walkthrough_completed, walkthrough_failed |
| Settings | sso_configured, team_settings_changed |

#### Implementation

**Step 1: Audit Log Model**

File: `backend/app/models/audit_log.py`

```python
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base
import uuid
from datetime import datetime

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # Nullable for system events
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)

    action = Column(String(100), nullable=False, index=True)  # e.g., 'user.login', 'workflow.create'
    resource_type = Column(String(50), nullable=False)  # e.g., 'user', 'workflow', 'step'
    resource_id = Column(UUID(as_uuid=True), nullable=True)

    ip_address = Column(String(45))  # IPv6 can be 45 chars
    user_agent = Column(String(500))

    old_values = Column(JSON, nullable=True)  # Previous state for updates
    new_values = Column(JSON, nullable=True)  # New state
    metadata = Column(JSON, default={})

    # Indexes for common queries
    __table_args__ = (
        Index("idx_audit_company_timestamp", "company_id", "timestamp"),
        Index("idx_audit_user_timestamp", "user_id", "timestamp"),
        Index("idx_audit_action", "action"),
    )
```

**Step 2: Audit Service**

File: `backend/app/services/audit.py`

```python
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.models.user import User
from fastapi import Request
import logging

logger = logging.getLogger(__name__)

class AuditService:
    """Service for recording audit logs."""

    @staticmethod
    def log(
        db: Session,
        action: str,
        resource_type: str,
        company_id: str,
        user_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        old_values: Optional[Dict] = None,
        new_values: Optional[Dict] = None,
        request: Optional[Request] = None,
        metadata: Optional[Dict] = None
    ):
        """Record an audit log entry."""
        try:
            log_entry = AuditLog(
                action=action,
                resource_type=resource_type,
                company_id=company_id,
                user_id=user_id,
                resource_id=resource_id,
                old_values=old_values,
                new_values=new_values,
                ip_address=AuditService._get_client_ip(request) if request else None,
                user_agent=request.headers.get("user-agent", "")[:500] if request else None,
                metadata=metadata or {}
            )
            db.add(log_entry)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
            # Don't raise - audit logging should not break the main flow

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract client IP from request, handling proxies."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


# Convenience functions
def audit_login(db: Session, user: User, request: Request, success: bool = True):
    action = "user.login" if success else "user.login_failed"
    AuditService.log(
        db=db,
        action=action,
        resource_type="user",
        company_id=str(user.company_id) if user.company_id else None,
        user_id=str(user.id),
        resource_id=str(user.id),
        request=request,
        metadata={"success": success}
    )

def audit_workflow_action(
    db: Session,
    action: str,
    workflow,
    user: User,
    request: Request,
    old_values: Dict = None,
    new_values: Dict = None
):
    AuditService.log(
        db=db,
        action=f"workflow.{action}",
        resource_type="workflow",
        company_id=str(user.company_id),
        user_id=str(user.id),
        resource_id=str(workflow.id),
        old_values=old_values,
        new_values=new_values,
        request=request
    )
```

**Step 3: Audit Decorator**

File: `backend/app/core/decorators.py`

```python
from functools import wraps
from fastapi import Request
from app.services.audit import AuditService

def audited(action: str, resource_type: str):
    """Decorator to automatically audit endpoint calls."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, request: Request, current_user, db, **kwargs):
            result = await func(*args, request=request, current_user=current_user, db=db, **kwargs)

            # Log after successful execution
            resource_id = kwargs.get("id") or kwargs.get("workflow_id") or kwargs.get("step_id")
            AuditService.log(
                db=db,
                action=action,
                resource_type=resource_type,
                company_id=str(current_user.company_id),
                user_id=str(current_user.id),
                resource_id=resource_id,
                request=request
            )

            return result
        return wrapper
    return decorator
```

**Step 4: Audit Log API**

File: `backend/app/api/audit.py`

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import csv
from io import StringIO
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/audit-logs", tags=["audit"])

@router.get("")
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """List audit logs for company (admin only)."""
    query = db.query(AuditLog).filter(
        AuditLog.company_id == current_user.company_id
    )

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)

    total = query.count()
    logs = query.order_by(AuditLog.timestamp.desc())\
                .offset((page - 1) * page_size)\
                .limit(page_size)\
                .all()

    return {
        "logs": [log.to_dict() for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get("/export")
async def export_audit_logs(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Export audit logs as CSV."""
    logs = db.query(AuditLog).filter(
        AuditLog.company_id == current_user.company_id,
        AuditLog.timestamp >= start_date,
        AuditLog.timestamp <= end_date
    ).order_by(AuditLog.timestamp.desc()).all()

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "User", "Action", "Resource Type", "Resource ID", "IP Address"])

    for log in logs:
        writer.writerow([
            log.timestamp.isoformat(),
            log.user_id,
            log.action,
            log.resource_type,
            log.resource_id,
            log.ip_address
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit-logs-{start_date.date()}-{end_date.date()}.csv"}
    )
```

**Step 5: Retention Cleanup Job**

File: `backend/app/tasks/cleanup.py`

```python
from celery import shared_task
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

@shared_task
def cleanup_old_audit_logs():
    """Delete audit logs older than retention period."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        retention_days = int(os.getenv("AUDIT_RETENTION_DAYS", "90"))
        cutoff = datetime.utcnow() - timedelta(days=retention_days)

        deleted = db.query(AuditLog).filter(
            AuditLog.timestamp < cutoff
        ).delete()

        db.commit()
        logger.info(f"Deleted {deleted} audit logs older than {retention_days} days")
    finally:
        db.close()
```

#### Acceptance Criteria
- [ ] Audit log model and migrations
- [ ] Audit service with logging functions
- [ ] All critical actions logged (login, CRUD operations)
- [ ] API endpoints for viewing logs (admin only)
- [ ] Export to CSV functionality
- [ ] Filter by user, action, resource, date range
- [ ] Retention cleanup job
- [ ] Cannot modify/delete logs (append-only)
- [ ] Tests for audit logging

---

## Sprint Execution Checklist

### Before Starting
- [ ] Sprints 1-6 completed
- [ ] All tests passing
- [ ] Understand SAML/OIDC protocols (research if needed)

### During Sprint
- [ ] Update sprint.md with daily progress
- [ ] Test SSO with real IdP (Okta free trial, Google Workspace)
- [ ] Commit incrementally

### Before Completing
- [ ] SSO flow tested end-to-end
- [ ] Audit logs recording all critical actions
- [ ] All tests passing
- [ ] Documentation updated

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SAML complexity | High | High | Start with OIDC (simpler), use established libraries |
| IdP configuration issues | Medium | Medium | Create detailed setup guide for each provider |
| Audit log volume | Low | Medium | Implement retention policy from start |

---

## Completion Criteria

Sprint is complete when:
1. SSO login works with at least one provider (Google or SAML)
2. SSO configuration UI available for admins
3. All critical actions create audit logs
4. Audit log viewing and export works
5. Retention cleanup job running
6. Tests pass
7. Documentation updated for SSO setup
