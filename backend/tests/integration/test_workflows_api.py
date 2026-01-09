"""
Integration tests for workflow CRUD API endpoints.

Tests full CRUD flow with multi-tenant isolation, pagination, and async processing.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
import json

from app.models.user import User
from app.models.company import Company
from app.models.workflow import Workflow
from app.models.step import Step
from app.utils.jwt import create_access_token


@pytest.fixture
def company1(db: Session) -> Company:
    """Create first test company."""
    company = Company(name="Company One", invite_token="invite-token-1")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def company2(db: Session) -> Company:
    """Create second test company for multi-tenancy tests."""
    company = Company(name="Company Two", invite_token="invite-token-2")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def user1(db: Session, company1: Company) -> User:
    """Create admin user for company1."""
    user = User(
        email="admin@company1.com",
        password_hash="hashed_password",
        name="Admin User",
        role="admin",
        company_id=company1.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def user2(db: Session, company2: Company) -> User:
    """Create admin user for company2 (different company)."""
    user = User(
        email="admin@company2.com",
        password_hash="hashed_password",
        name="Admin Two",
        role="admin",
        company_id=company2.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def token1(user1: User) -> str:
    """Create JWT token for user1."""
    return create_access_token({
        "user_id": user1.id,
        "company_id": user1.company_id,
        "role": user1.role,
        "email": user1.email,
    })


@pytest.fixture
def token2(user2: User) -> str:
    """Create JWT token for user2 (different company)."""
    return create_access_token({
        "user_id": user2.id,
        "company_id": user2.company_id,
        "role": user2.role,
        "email": user2.email,
    })


@pytest.fixture
def sample_workflow_data() -> dict:
    """Sample workflow creation payload."""
    return {
        "name": "Submit Expense Report",
        "description": "Process for submitting monthly expense reports",
        "starting_url": "https://app.netsuite.com/expenses",
        "tags": ["finance", "expenses"],
        "steps": [
            {
                "step_number": 1,
                "timestamp": "2025-11-19T10:30:00.000Z",
                "action_type": "click",
                "selectors": {
                    "primary": "#new-expense-btn",
                    "css": "button.new-expense",
                    "xpath": "//button[@id='new-expense-btn']"
                },
                "element_meta": {
                    "tag_name": "BUTTON",
                    "role": "button",
                    "inner_text": "New Expense"
                },
                "page_context": {
                    "url": "https://app.netsuite.com/expenses",
                    "title": "Expenses"
                },
                "action_data": {
                    "click_coordinates": {"x": 10, "y": 15}
                },
                "screenshot_id": None
            },
            {
                "step_number": 2,
                "timestamp": "2025-11-19T10:30:05.000Z",
                "action_type": "input_commit",
                "selectors": {
                    "primary": "#amount-input",
                    "css": "input[name='amount']"
                },
                "element_meta": {
                    "tag_name": "INPUT",
                    "type": "text",
                    "name": "amount"
                },
                "page_context": {
                    "url": "https://app.netsuite.com/expenses/new",
                    "title": "New Expense"
                },
                "action_data": {
                    "input_value": "125.50"
                }
            }
        ]
    }


class TestCreateWorkflow:
    """Test POST /api/workflows endpoint."""

    def test_create_workflow_success(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User,
        sample_workflow_data: dict
    ):
        """Test creating workflow returns immediately with processing status."""
        response = client.post(
            "/api/workflows",
            json=sample_workflow_data,
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 201
        data = response.json()

        # Check immediate response (async upload workflow - Story 2.3)
        assert "workflow_id" in data
        assert data["status"] == "draft"

        # Verify workflow was created in database
        workflow = db.query(Workflow).filter(Workflow.id == data["workflow_id"]).first()
        assert workflow is not None
        assert workflow.name == "Submit Expense Report"
        assert workflow.company_id == user1.company_id
        assert workflow.created_by == user1.id
        assert workflow.status == "draft"
        assert workflow.starting_url == "https://app.netsuite.com/expenses"

        # Verify tags stored as JSON
        assert json.loads(workflow.tags) == ["finance", "expenses"]

        # Verify steps were created
        steps = db.query(Step).filter(Step.workflow_id == workflow.id).order_by(Step.step_number).all()
        assert len(steps) == 2

        # Check first step
        step1 = steps[0]
        assert step1.step_number == 1
        assert step1.action_type == "click"
        assert json.loads(step1.selectors)["primary"] == "#new-expense-btn"
        assert json.loads(step1.element_meta)["tag_name"] == "BUTTON"

        # Check second step
        step2 = steps[1]
        assert step2.step_number == 2
        assert step2.action_type == "input_commit"
        assert json.loads(step2.action_data)["input_value"] == "125.50"

    def test_create_workflow_without_auth_fails(
        self,
        client: TestClient,
        sample_workflow_data: dict
    ):
        """Test creating workflow without authentication fails."""
        response = client.post(
            "/api/workflows",
            json=sample_workflow_data
        )

        assert response.status_code == 401  # Missing token returns 401

    def test_create_workflow_with_invalid_token_fails(
        self,
        client: TestClient,
        sample_workflow_data: dict
    ):
        """Test creating workflow with invalid token fails."""
        response = client.post(
            "/api/workflows",
            json=sample_workflow_data,
            headers={"Authorization": "Bearer invalid-token"}
        )

        assert response.status_code == 401

    def test_create_workflow_from_extension_recording(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test creating workflow with data structure from extension recording.
        
        This test validates the exact data format sent by the extension,
        including null timestamps and screenshot_ids.
        """
        # Data structure as sent by the extension
        extension_data = {
            "name": "Test Extension Recording",
            "description": None,
            "starting_url": "http://localhost:3000/dashboard",
            "tags": [],
            "steps": [
                {
                    "step_number": 1,
                    "timestamp": None,  # Extension sends null initially
                    "action_type": "click",
                    "selectors": {
                        "primary": "#dashboard-link",
                        "css": "a.dashboard-link"
                    },
                    "element_meta": {
                        "tag_name": "A",
                        "inner_text": "Dashboard"
                    },
                    "page_context": {
                        "url": "http://localhost:3000/dashboard",
                        "title": "Dashboard"
                    },
                    "action_data": None,
                    "dom_context": None,
                    "screenshot_id": None  # Screenshots uploaded separately
                },
                {
                    "step_number": 2,
                    "timestamp": None,
                    "action_type": "click",
                    "selectors": {
                        "primary": ".refresh-btn"
                    },
                    "element_meta": {
                        "tag_name": "BUTTON",
                        "inner_text": "Refresh"
                    },
                    "page_context": {
                        "url": "http://localhost:3000/dashboard",
                        "title": "Dashboard"
                    },
                    "action_data": None,
                    "dom_context": None,
                    "screenshot_id": None
                }
            ]
        }
        
        response = client.post(
            "/api/workflows",
            json=extension_data,
            headers={"Authorization": f"Bearer {token1}"}
        )
        
        # Should succeed with 201
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.json()}"
        data = response.json()
        
        assert "workflow_id" in data
        assert data["status"] == "draft"

        # Verify workflow in database
        workflow = db.query(Workflow).filter(Workflow.id == data["workflow_id"]).first()
        assert workflow is not None
        assert workflow.name == "Test Extension Recording"
        assert workflow.company_id == user1.company_id
        
        # Verify steps were created with null values handled correctly
        steps = db.query(Step).filter(Step.workflow_id == workflow.id).order_by(Step.step_number).all()
        assert len(steps) == 2
        
        # Check steps handle null fields correctly
        for step in steps:
            assert step.timestamp is None
            assert step.screenshot_id is None
            assert step.action_data is None
            assert step.dom_context is None
    
    def test_create_workflow_without_steps_fails(
        self,
        client: TestClient,
        token1: str
    ):
        """Test creating workflow without steps fails validation."""
        response = client.post(
            "/api/workflows",
            json={
                "name": "Empty Workflow",
                "starting_url": "https://example.com",
                "steps": []  # Empty steps array
            },
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 422  # Validation error


class TestListWorkflows:
    """Test GET /api/workflows endpoint."""

    def test_list_workflows_empty(
        self,
        client: TestClient,
        token1: str
    ):
        """Test listing workflows when none exist."""
        response = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total"] == 0
        assert data["limit"] == 10
        assert data["offset"] == 0
        assert data["workflows"] == []

    def test_list_workflows_with_data(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test listing workflows returns correct data."""
        # Create test workflows
        workflow1 = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Workflow 1",
            starting_url="https://example.com/1",
            tags=json.dumps(["tag1"]),
            status="active"
        )
        workflow2 = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Workflow 2",
            starting_url="https://example.com/2",
            tags=json.dumps(["tag2"]),
            status="draft"
        )
        db.add_all([workflow1, workflow2])
        db.commit()

        # Add steps to workflow1
        step1 = Step(
            workflow_id=workflow1.id,
            step_number=1,
            action_type="click",
            selectors=json.dumps({"primary": "#btn"}),
            element_meta=json.dumps({"tag": "BUTTON"}),
            page_context=json.dumps({"url": "https://example.com"})
        )
        step2 = Step(
            workflow_id=workflow1.id,
            step_number=2,
            action_type="input_commit",
            selectors=json.dumps({"primary": "#input"}),
            element_meta=json.dumps({"tag": "INPUT"}),
            page_context=json.dumps({"url": "https://example.com"})
        )
        db.add_all([step1, step2])
        db.commit()

        response = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["total"] == 2
        assert len(data["workflows"]) == 2

        # Check workflow data includes step_count
        workflows = {w["name"]: w for w in data["workflows"]}
        assert "Workflow 1" in workflows
        assert "Workflow 2" in workflows
        assert workflows["Workflow 1"]["step_count"] == 2
        assert workflows["Workflow 2"]["step_count"] == 0

    def test_list_workflows_multi_tenant_isolation(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        token2: str,
        user1: User,
        user2: User
    ):
        """Test multi-tenant isolation - users only see their company's workflows."""
        # Create workflow for company1
        workflow1 = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Company 1 Workflow",
            starting_url="https://example.com/1",
            tags=json.dumps([])
        )
        # Create workflow for company2
        workflow2 = Workflow(
            company_id=user2.company_id,
            created_by=user2.id,
            name="Company 2 Workflow",
            starting_url="https://example.com/2",
            tags=json.dumps([])
        )
        db.add_all([workflow1, workflow2])
        db.commit()

        # User1 should only see company1's workflow
        response1 = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        assert data1["total"] == 1
        assert data1["workflows"][0]["name"] == "Company 1 Workflow"
        assert data1["workflows"][0]["company_id"] == user1.company_id

        # User2 should only see company2's workflow
        response2 = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token2}"}
        )
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["total"] == 1
        assert data2["workflows"][0]["name"] == "Company 2 Workflow"
        assert data2["workflows"][0]["company_id"] == user2.company_id

    def test_list_workflows_pagination(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test pagination works correctly."""
        # Create 15 workflows
        for i in range(15):
            workflow = Workflow(
                company_id=user1.company_id,
                created_by=user1.id,
                name=f"Workflow {i+1}",
                starting_url=f"https://example.com/{i+1}",
                tags=json.dumps([])
            )
            db.add(workflow)
        db.commit()

        # Get first page (limit=10)
        response1 = client.get(
            "/api/workflows?limit=10&offset=0",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        assert data1["total"] == 15
        assert len(data1["workflows"]) == 10
        assert data1["limit"] == 10
        assert data1["offset"] == 0

        # Get second page (limit=10, offset=10)
        response2 = client.get(
            "/api/workflows?limit=10&offset=10",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["total"] == 15
        assert len(data2["workflows"]) == 5
        assert data2["limit"] == 10
        assert data2["offset"] == 10


class TestGetWorkflow:
    """Test GET /api/workflows/:id endpoint."""

    def test_get_workflow_success(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test getting workflow by ID returns full details including steps."""
        # Create workflow with steps
        workflow = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Test Workflow",
            description="Test description",
            starting_url="https://example.com",
            tags=json.dumps(["test", "example"]),
            status="active",
            success_rate=0.95,
            total_uses=42
        )
        db.add(workflow)
        db.flush()

        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors=json.dumps({"primary": "#btn"}),
            element_meta=json.dumps({"tag_name": "BUTTON"}),
            page_context=json.dumps({"url": "https://example.com"})
        )
        db.add(step)
        db.commit()

        response = client.get(
            f"/api/workflows/{workflow.id}",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == workflow.id
        assert data["name"] == "Test Workflow"
        assert data["description"] == "Test description"
        assert data["starting_url"] == "https://example.com"
        assert data["tags"] == ["test", "example"]
        assert data["status"] == "active"
        assert data["success_rate"] == 0.95
        assert data["total_uses"] == 42
        assert data["step_count"] == 1
        assert len(data["steps"]) == 1

        # Check step data
        step_data = data["steps"][0]
        assert step_data["step_number"] == 1
        assert step_data["action_type"] == "click"
        assert step_data["selectors"]["primary"] == "#btn"
        assert step_data["element_meta"]["tag_name"] == "BUTTON"

    def test_get_workflow_not_found(
        self,
        client: TestClient,
        token1: str
    ):
        """Test getting non-existent workflow returns 404."""
        response = client.get(
            "/api/workflows/999999",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"]["message"].lower()

    def test_get_workflow_different_company_returns_404(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user2: User
    ):
        """Test accessing workflow from different company returns 404 (multi-tenant isolation)."""
        # Create workflow for company2
        workflow = Workflow(
            company_id=user2.company_id,
            created_by=user2.id,
            name="Company 2 Workflow",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.commit()

        # Try to access with token1 (different company)
        response = client.get(
            f"/api/workflows/{workflow.id}",
            headers={"Authorization": f"Bearer {token1}"}
        )

        # Should return 404 (not 403) to prevent information leakage
        assert response.status_code == 404


class TestUpdateWorkflow:
    """Test PUT /api/workflows/:id endpoint."""

    def test_update_workflow_success(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test updating workflow metadata."""
        # Create workflow
        workflow = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Original Name",
            description="Original description",
            starting_url="https://example.com",
            tags=json.dumps(["old"]),
            status="draft"
        )
        db.add(workflow)
        db.commit()

        # Update workflow (note: can't activate without steps with labels)
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
                "tags": ["new", "updated"],
                "status": "needs_review"
            },
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 200
        data = response.json()

        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        assert data["tags"] == ["new", "updated"]
        assert data["status"] == "needs_review"

        # Verify in database
        db.refresh(workflow)
        assert workflow.name == "Updated Name"
        assert workflow.status == "needs_review"

    def test_update_workflow_partial(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test partial update (only updating some fields)."""
        workflow = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="Original Name",
            description="Original description",
            starting_url="https://example.com",
            tags=json.dumps(["tag"]),
            status="draft"
        )
        db.add(workflow)
        db.commit()

        # Only update name
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"name": "New Name"},
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 200
        data = response.json()

        # Updated field
        assert data["name"] == "New Name"
        # Unchanged fields
        assert data["description"] == "Original description"
        assert data["tags"] == ["tag"]
        assert data["status"] == "draft"

    def test_update_workflow_different_company_returns_404(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user2: User
    ):
        """Test updating workflow from different company returns 404."""
        workflow = Workflow(
            company_id=user2.company_id,
            created_by=user2.id,
            name="Company 2 Workflow",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.commit()

        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"name": "Hacked Name"},
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 404


class TestDeleteWorkflow:
    """Test DELETE /api/workflows/:id endpoint."""

    def test_delete_workflow_success(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User
    ):
        """Test deleting workflow cascades to steps."""
        # Create workflow with steps
        workflow = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="To Delete",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.flush()

        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors=json.dumps({"primary": "#btn"}),
            element_meta=json.dumps({"tag": "BUTTON"}),
            page_context=json.dumps({"url": "https://example.com"})
        )
        db.add(step)
        db.commit()

        workflow_id = workflow.id

        # Delete workflow
        response = client.delete(
            f"/api/workflows/{workflow_id}",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 204

        # Verify workflow deleted
        assert db.query(Workflow).filter(Workflow.id == workflow_id).first() is None

        # Verify steps cascade deleted
        assert db.query(Step).filter(Step.workflow_id == workflow_id).count() == 0

    def test_delete_workflow_different_company_returns_404(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user2: User
    ):
        """Test deleting workflow from different company returns 404."""
        workflow = Workflow(
            company_id=user2.company_id,
            created_by=user2.id,
            name="Company 2 Workflow",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.commit()

        response = client.delete(
            f"/api/workflows/{workflow.id}",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 404

        # Verify workflow NOT deleted
        assert db.query(Workflow).filter(Workflow.id == workflow.id).first() is not None

    def test_delete_workflow_cleans_up_screenshot_files(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user1: User,
        tmp_path,
        monkeypatch
    ):
        """Test that deleting workflow also deletes screenshot files from storage."""
        import pathlib
        import shutil
        from app.utils import s3

        # Create a mock storage directory
        mock_storage_dir = tmp_path / "screenshots"
        mock_storage_dir.mkdir()

        # Patch the s3 module to use our temp directory
        def mock_delete_directory(storage_key_prefix: str) -> bool:
            dir_path = mock_storage_dir / storage_key_prefix
            try:
                if dir_path.exists() and dir_path.is_dir():
                    shutil.rmtree(dir_path)
                return True
            except Exception:
                return False

        monkeypatch.setattr(s3, "delete_directory", mock_delete_directory)

        # Also patch in workflow module
        from app.services import workflow as workflow_module
        monkeypatch.setattr(workflow_module, "delete_directory", mock_delete_directory)

        # Create workflow
        workflow = Workflow(
            company_id=user1.company_id,
            created_by=user1.id,
            name="With Screenshots",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.flush()

        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors=json.dumps({"primary": "#btn"}),
            element_meta=json.dumps({"tag": "BUTTON"}),
            page_context=json.dumps({"url": "https://example.com"})
        )
        db.add(step)
        db.commit()

        workflow_id = workflow.id
        company_id = user1.company_id

        # Create mock screenshot files in the expected location
        screenshot_dir = mock_storage_dir / "companies" / str(company_id) / "workflows" / str(workflow_id) / "screenshots"
        screenshot_dir.mkdir(parents=True)
        (screenshot_dir / "1.jpg").write_bytes(b"fake screenshot 1")
        (screenshot_dir / "2.jpg").write_bytes(b"fake screenshot 2")

        # Verify files exist before deletion
        assert screenshot_dir.exists()
        assert (screenshot_dir / "1.jpg").exists()
        assert (screenshot_dir / "2.jpg").exists()

        # Delete workflow
        response = client.delete(
            f"/api/workflows/{workflow_id}",
            headers={"Authorization": f"Bearer {token1}"}
        )

        assert response.status_code == 204

        # Verify workflow deleted from DB
        assert db.query(Workflow).filter(Workflow.id == workflow_id).first() is None

        # Verify screenshot files were cleaned up
        workflow_dir = mock_storage_dir / "companies" / str(company_id) / "workflows" / str(workflow_id)
        assert not workflow_dir.exists(), "Screenshot files should be deleted when workflow is deleted"


class TestMultiTenancyIsolation:
    """Comprehensive multi-tenancy security tests."""

    def test_cannot_access_other_company_workflows_via_list(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        token2: str,
        user1: User,
        user2: User
    ):
        """Verify complete isolation between companies in list endpoint."""
        # Create 5 workflows for each company
        for i in range(5):
            w1 = Workflow(
                company_id=user1.company_id,
                created_by=user1.id,
                name=f"Company 1 - Workflow {i}",
                starting_url="https://example.com",
                tags=json.dumps([])
            )
            w2 = Workflow(
                company_id=user2.company_id,
                created_by=user2.id,
                name=f"Company 2 - Workflow {i}",
                starting_url="https://example.com",
                tags=json.dumps([])
            )
            db.add_all([w1, w2])
        db.commit()

        # User1 should only see 5 workflows
        response1 = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response1.json()["total"] == 5

        # User2 should only see 5 workflows
        response2 = client.get(
            "/api/workflows",
            headers={"Authorization": f"Bearer {token2}"}
        )
        assert response2.json()["total"] == 5

        # Verify no overlap in workflow names
        names1 = {w["name"] for w in response1.json()["workflows"]}
        names2 = {w["name"] for w in response2.json()["workflows"]}
        assert len(names1 & names2) == 0  # No intersection

    def test_cannot_modify_other_company_workflows(
        self,
        client: TestClient,
        db: Session,
        token1: str,
        user2: User
    ):
        """Verify users cannot modify workflows from other companies."""
        workflow = Workflow(
            company_id=user2.company_id,
            created_by=user2.id,
            name="Protected Workflow",
            starting_url="https://example.com",
            tags=json.dumps([])
        )
        db.add(workflow)
        db.commit()

        # Try to update with token1 (different company)
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"name": "Hacked"},
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response.status_code == 404

        # Try to delete with token1 (different company)
        response = client.delete(
            f"/api/workflows/{workflow.id}",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response.status_code == 404

        # Verify workflow unchanged
        db.refresh(workflow)
        assert workflow.name == "Protected Workflow"
