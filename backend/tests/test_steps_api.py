"""
Tests for Step API endpoints (BE-006).

Tests:
- GET /api/steps/:id (retrieve step details)
- PUT /api/steps/:id (update step labels)
- Multi-tenant isolation
- Input validation
- Edit tracking
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime

from app.main import app
from app.models.step import Step
from app.models.workflow import Workflow
from app.models.company import Company
from app.models.user import User
from app.utils.jwt import create_access_token


@pytest.fixture
def test_company(db: Session) -> Company:
    """Create test company."""
    company = Company(name="Test Company", invite_token="test-token")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def other_company(db: Session) -> Company:
    """Create another company for multi-tenancy tests."""
    company = Company(name="Other Company", invite_token="other-token")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def test_user(db: Session, test_company: Company, client: TestClient) -> User:
    """Create test user and authenticate client."""
    user = User(
        email="test@example.com",
        password_hash="hashed_password",
        name="Test User",
        role="admin",
        company_id=test_company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Authenticate client
    token = create_access_token(data={
        "user_id": user.id,
        "company_id": user.company_id,
        "email": user.email,
        "role": user.role
    })
    client.headers["Authorization"] = f"Bearer {token}"
    
    return user


@pytest.fixture
def other_user(db: Session, other_company: Company) -> User:
    """Create user from other company."""
    user = User(
        email="other@example.com",
        password_hash="hashed_password",
        name="Other User",
        role="admin",
        company_id=other_company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestGetStep:
    """Test GET /api/steps/:id endpoint."""
    
    def test_get_step_success(self, client, test_user, db):
        """Test retrieving step details successfully."""
        # Create workflow and step
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Test Button",
            instruction="Click the test button"
        )
        db.add(step)
        db.commit()
        
        # Get step
        response = client.get(f"/api/steps/{step.id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == step.id
        assert data["step_number"] == 1
        assert data["field_label"] == "Test Button"
        assert data["instruction"] == "Click the test button"
    
    def test_get_step_not_found(self, client, test_user):
        """Test getting non-existent step returns 404."""
        response = client.get("/api/steps/99999")
        
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    
    def test_get_step_forbidden_other_company(self, client, test_user, other_user, db):
        """Test users cannot access steps from other companies."""
        # Create workflow for other company
        workflow = Workflow(
            company_id=other_user.company_id,
            created_by=other_user.id,
            name="Other Company Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}'
        )
        db.add(step)
        db.commit()
        
        # Try to access with test_user credentials
        response = client.get(f"/api/steps/{step.id}")
        
        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()


class TestUpdateStep:
    """Test PUT /api/steps/:id endpoint."""
    
    def test_update_step_label_only(self, client, test_user, db):
        """Test updating only the field label."""
        # Create workflow and step
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Original Label",
            instruction="Original instruction"
        )
        db.add(step)
        db.commit()
        
        # Update label only
        response = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "Updated Label"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["field_label"] == "Updated Label"
        assert data["instruction"] == "Original instruction"  # Unchanged
        assert data["label_edited"] is True
        assert data["instruction_edited"] is False
        assert data["edited_by"] == test_user.id
        assert data["edited_at"] is not None
    
    def test_update_step_instruction_only(self, client, test_user, db):
        """Test updating only the instruction."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Button",
            instruction="Original instruction"
        )
        db.add(step)
        db.commit()
        
        response = client.put(
            f"/api/steps/{step.id}",
            json={"instruction": "Updated instruction"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["field_label"] == "Button"  # Unchanged
        assert data["instruction"] == "Updated instruction"
        assert data["label_edited"] is False
        assert data["instruction_edited"] is True
    
    def test_update_step_both_fields(self, client, test_user, db):
        """Test updating both label and instruction."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Original",
            instruction="Original"
        )
        db.add(step)
        db.commit()
        
        response = client.put(
            f"/api/steps/{step.id}",
            json={
                "field_label": "New Label",
                "instruction": "New instruction"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["field_label"] == "New Label"
        assert data["instruction"] == "New instruction"
        assert data["label_edited"] is True
        assert data["instruction_edited"] is True
    
    def test_update_step_no_fields_error(self, client, test_user, db):
        """Test updating with no fields returns 400."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}'
        )
        db.add(step)
        db.commit()
        
        response = client.put(f"/api/steps/{step.id}", json={})
        
        assert response.status_code == 400
        assert "at least one field" in response.json()["detail"].lower()
    
    def test_update_step_empty_label_error(self, client, test_user, db):
        """Test updating with empty label returns 400."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}'
        )
        db.add(step)
        db.commit()
        
        response = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "   "}  # Whitespace only
        )
        
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()
    
    def test_update_step_label_too_long(self, client, test_user, db):
        """Test label exceeding max length returns 422."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}'
        )
        db.add(step)
        db.commit()
        
        response = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "x" * 101}  # 101 chars (max is 100)
        )
        
        assert response.status_code == 422  # Pydantic validation error
    
    def test_update_step_not_found(self, client, test_user):
        """Test updating non-existent step returns 404."""
        response = client.put(
            "/api/steps/99999",
            json={"field_label": "New Label"}
        )
        
        assert response.status_code == 404
    
    def test_update_step_forbidden_other_company(self, client, test_user, other_user, db):
        """Test users cannot edit steps from other companies."""
        workflow = Workflow(
            company_id=other_user.company_id,
            created_by=other_user.id,
            name="Other Company Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}'
        )
        db.add(step)
        db.commit()
        
        response = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "Hacked Label"}
        )
        
        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()
    
    def test_update_step_multiple_times(self, client, test_user, db):
        """Test editing the same step multiple times updates tracking."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Version 1"
        )
        db.add(step)
        db.commit()
        
        # First edit
        response1 = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "Version 2"}
        )
        assert response1.status_code == 200
        edited_at_1 = response1.json()["edited_at"]
        
        # Second edit (should update edited_at)
        response2 = client.put(
            f"/api/steps/{step.id}",
            json={"field_label": "Version 3"}
        )
        assert response2.status_code == 200
        edited_at_2 = response2.json()["edited_at"]
        
        assert edited_at_2 >= edited_at_1  # Timestamp should be same or later
        assert response2.json()["field_label"] == "Version 3"


class TestDeleteStep:
    """Test DELETE /api/steps/:id endpoint."""

    def test_delete_step_success(self, client, test_user, db):
        """Test deleting a step successfully with renumbering."""
        # Create workflow with 3 steps
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()

        steps = []
        for i in range(1, 4):
            step = Step(
                workflow_id=workflow.id,
                step_number=i,
                action_type="click",
                selectors='{"primary": "#btn"}',
                element_meta='{"tag_name": "button"}',
                page_context='{"url": "https://example.com"}',
                field_label=f"Step {i}",
                instruction=f"Instruction {i}"
            )
            db.add(step)
            steps.append(step)
        db.commit()

        # Delete step 2
        step_to_delete = steps[1]
        response = client.delete(f"/api/steps/{step_to_delete.id}")

        assert response.status_code == 204

        # Verify remaining steps are renumbered
        db.expire_all()
        remaining_steps = db.query(Step).filter(
            Step.workflow_id == workflow.id
        ).order_by(Step.step_number).all()

        assert len(remaining_steps) == 2
        assert remaining_steps[0].step_number == 1
        assert remaining_steps[0].field_label == "Step 1"
        assert remaining_steps[1].step_number == 2
        assert remaining_steps[1].field_label == "Step 3"

    def test_delete_last_step_not_allowed(self, client, test_user, db):
        """Test that deleting the last step in a workflow is not allowed."""
        # Create workflow with only 1 step
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()

        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Only Step",
            instruction="Only instruction"
        )
        db.add(step)
        db.commit()

        # Try to delete the only step
        response = client.delete(f"/api/steps/{step.id}")

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "CANNOT_DELETE_LAST_STEP"
        assert "Cannot delete the last step" in data["detail"]["message"]

        # Verify step was not deleted
        db.expire_all()
        remaining_step = db.query(Step).filter(Step.id == step.id).first()
        assert remaining_step is not None

    def test_delete_step_not_found(self, client, test_user):
        """Test deleting non-existent step returns 404."""
        response = client.delete("/api/steps/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_step_forbidden_other_company(self, client, test_user, other_user, db):
        """Test users cannot delete steps from other companies."""
        # Create workflow for other company with 2 steps
        workflow = Workflow(
            company_id=other_user.company_id,
            created_by=other_user.id,
            name="Other Company Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()

        for i in range(1, 3):
            step = Step(
                workflow_id=workflow.id,
                step_number=i,
                action_type="click",
                selectors='{"primary": "#btn"}',
                element_meta='{"tag_name": "button"}',
                page_context='{"url": "https://example.com"}'
            )
            db.add(step)
        db.commit()

        step = db.query(Step).filter(Step.workflow_id == workflow.id).first()

        # Try to delete with test_user credentials
        response = client.delete(f"/api/steps/{step.id}")

        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
