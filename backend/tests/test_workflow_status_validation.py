"""
Tests for workflow status validation (BE-008).

Tests:
- Activating complete workflows (should succeed)
- Activating incomplete workflows (should fail with 400)
- Validation messages show which steps are missing labels
"""
import pytest
from sqlalchemy.orm import Session

from app.models.workflow import Workflow
from app.models.step import Step
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
def test_user(db: Session, test_company: Company, client) -> User:
    """Create test user and authenticate client."""
    user = User(
        email="test@example.com",
        password_hash="hashed",
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


class TestWorkflowStatusValidation:
    """Test workflow activation validation."""
    
    def test_activate_complete_workflow(self, client, test_user, db):
        """Test activating workflow with all steps labeled."""
        # Create workflow with complete steps
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Complete Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        # Add steps with labels
        for i in range(1, 4):
            step = Step(
                workflow_id=workflow.id,
                step_number=i,
                action_type="click",
                selectors=f'{{"primary": "#btn{i}"}}',
                element_meta='{"tag_name": "button"}',
                page_context='{"url": "https://example.com"}',
                field_label=f"Button {i}",
                instruction=f"Click button {i}"
            )
            db.add(step)
        
        db.commit()
        
        # Activate workflow
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "active"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "active"
        assert data["updated_at"] is not None
    
    def test_activate_workflow_missing_labels(self, client, test_user, db):
        """Test activating workflow with missing field labels fails."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Incomplete Workflow",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        # Add steps WITHOUT labels
        step1 = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn1"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            # Missing field_label and instruction
        )
        step2 = Step(
            workflow_id=workflow.id,
            step_number=2,
            action_type="click",
            selectors='{"primary": "#btn2"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Button 2",
            instruction="Click button 2"
        )
        db.add(step1)
        db.add(step2)
        db.commit()
        
        # Try to activate - should fail
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "active"}
        )
        
        assert response.status_code == 400
        data = response.json()["detail"]
        assert data["code"] == "WORKFLOW_INCOMPLETE"
        assert "missing labels" in data["message"]
        assert "incomplete_steps" in data
        assert len(data["incomplete_steps"]) == 1
        assert data["incomplete_steps"][0]["step_number"] == 1
    
    def test_activate_workflow_missing_instructions(self, client, test_user, db):
        """Test activating workflow with missing instructions fails."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Missing Instructions",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        # Step with label but no instruction
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="Submit Button",
            # Missing instruction
        )
        db.add(step)
        db.commit()
        
        # Try to activate
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "active"}
        )
        
        assert response.status_code == 400
        data = response.json()["detail"]
        assert "incomplete_steps" in data
        assert data["incomplete_steps"][0]["missing"] == "instruction"
    
    def test_activate_workflow_with_empty_labels(self, client, test_user, db):
        """Test that whitespace-only labels are rejected."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Empty Labels",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.flush()
        
        # Step with whitespace-only label
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            field_label="   ",  # Whitespace only
            instruction="Click button"
        )
        db.add(step)
        db.commit()
        
        # Try to activate
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "active"}
        )
        
        assert response.status_code == 400
    
    def test_activate_workflow_no_steps(self, client, test_user, db):
        """Test activating workflow with no steps fails."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="No Steps",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.commit()
        
        # Try to activate (no steps)
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "active"}
        )
        
        assert response.status_code == 400
        data = response.json()["detail"]
        assert "no steps" in data["message"].lower()
    
    def test_update_to_draft_no_validation(self, client, test_user, db):
        """Test changing status to draft doesn't require validation."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Incomplete Workflow",
            starting_url="https://example.com",
            status="processing"
        )
        db.add(workflow)
        db.flush()
        
        # Add incomplete step
        step = Step(
            workflow_id=workflow.id,
            step_number=1,
            action_type="click",
            selectors='{"primary": "#btn"}',
            element_meta='{"tag_name": "button"}',
            page_context='{"url": "https://example.com"}',
            # No labels
        )
        db.add(step)
        db.commit()
        
        # Change to draft (should succeed even without labels)
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"status": "draft"}
        )
        
        assert response.status_code == 200
        assert response.json()["status"] == "draft"
    
    def test_update_name_without_status_change(self, client, test_user, db):
        """Test updating name doesn't trigger validation."""
        workflow = Workflow(
            company_id=test_user.company_id,
            created_by=test_user.id,
            name="Old Name",
            starting_url="https://example.com",
            status="draft"
        )
        db.add(workflow)
        db.commit()
        
        # Update name only (no status change)
        response = client.put(
            f"/api/workflows/{workflow.id}",
            json={"name": "New Name"}
        )
        
        assert response.status_code == 200
        assert response.json()["name"] == "New Name"
        assert response.json()["status"] == "draft"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
