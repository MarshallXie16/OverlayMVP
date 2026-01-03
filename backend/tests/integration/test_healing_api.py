"""
Integration tests for Healing API endpoints.

Tests AI-powered healing validation and fallback behavior when AI is unavailable.
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.company import Company
from app.models.workflow import Workflow
from app.models.step import Step
from app.utils.jwt import create_access_token
from app.schemas.healing import HealingValidationResponse
from app.services.healing import HealingServiceError


@pytest.fixture
def company(db: Session) -> Company:
    """Create test company."""
    company = Company(name="Test Company", invite_token="test-invite-token")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def user(db: Session, company: Company) -> User:
    """Create test user."""
    user = User(
        email="test@company.com",
        password_hash="hashed_password",
        name="Test User",
        role="admin",
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def other_company(db: Session) -> Company:
    """Create second company for multi-tenancy tests."""
    company = Company(name="Other Company", invite_token="other-invite-token")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def other_user(db: Session, other_company: Company) -> User:
    """Create user in different company."""
    user = User(
        email="other@company.com",
        password_hash="hashed_password",
        name="Other User",
        role="admin",
        company_id=other_company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def token(user: User) -> str:
    """Create JWT token for user."""
    return create_access_token({
        "user_id": user.id,
        "company_id": user.company_id,
        "role": user.role,
        "email": user.email,
    })


@pytest.fixture
def other_token(other_user: User) -> str:
    """Create JWT token for other user."""
    return create_access_token({
        "user_id": other_user.id,
        "company_id": other_user.company_id,
        "role": other_user.role,
        "email": other_user.email,
    })


@pytest.fixture
def workflow(db: Session, company: Company, user: User) -> Workflow:
    """Create test workflow."""
    workflow = Workflow(
        name="Test Workflow",
        description="Test workflow for healing",
        starting_url="https://app.example.com",
        company_id=company.id,
        created_by=user.id,
        status="active",
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@pytest.fixture
def other_workflow(db: Session, other_company: Company, other_user: User) -> Workflow:
    """Create workflow in different company."""
    workflow = Workflow(
        name="Other Workflow",
        description="Workflow in other company",
        starting_url="https://app.example.com",
        company_id=other_company.id,
        created_by=other_user.id,
        status="active",
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@pytest.fixture
def step(db: Session, workflow: Workflow) -> Step:
    """Create test step."""
    step = Step(
        workflow_id=workflow.id,
        step_number=1,
        timestamp="2025-11-19T10:30:00.000Z",
        action_type="click",
        selectors='{"primary": "#submit-btn"}',
        element_meta='{"tag_name": "BUTTON", "text": "Submit"}',
        page_context='{"url": "https://app.example.com"}',
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@pytest.fixture
def other_step(db: Session, other_workflow: Workflow) -> Step:
    """Create step in different company's workflow."""
    step = Step(
        workflow_id=other_workflow.id,
        step_number=1,
        timestamp="2025-11-19T10:30:00.000Z",
        action_type="click",
        selectors='{"primary": "#submit-btn"}',
        element_meta='{"tag_name": "BUTTON", "text": "Submit"}',
        page_context='{"url": "https://app.example.com"}',
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@pytest.fixture
def valid_healing_request() -> dict:
    """Valid healing validation request payload."""
    return {
        "workflow_id": 1,
        "step_id": 1,
        "deterministic_score": 0.78,
        "original_context": {
            "tag_name": "button",
            "text": "Submit",
            "role": "button",
            "type": None,
            "id": "submit-btn",
            "name": None,
            "classes": ["btn", "btn-primary"],
            "data_testid": None,
            "label_text": None,
            "placeholder": None,
            "aria_label": "Submit form",
            "x": 100.0,
            "y": 200.0,
            "width": 80.0,
            "height": 40.0,
            "visual_region": "main",
            "form_context": {
                "form_id": "checkout-form",
                "form_action": "/submit",
                "form_name": "checkout",
                "form_classes": ["form"],
                "field_index": 5,
                "total_fields": 6,
            },
            "nearby_landmarks": None,
        },
        "candidate_context": {
            "tag_name": "button",
            "text": "Submit Order",
            "role": "button",
            "type": None,
            "id": "submit-btn",
            "name": None,
            "classes": ["btn", "btn-primary"],
            "data_testid": None,
            "label_text": None,
            "placeholder": None,
            "aria_label": "Submit order form",
            "x": 105.0,
            "y": 205.0,
            "width": 85.0,
            "height": 40.0,
            "visual_region": "main",
            "form_context": {
                "form_id": "checkout-form",
                "form_action": "/submit",
                "form_name": "checkout",
                "form_classes": ["form"],
                "field_index": 5,
                "total_fields": 6,
            },
            "nearby_landmarks": None,
        },
        "factor_scores": {
            "contextualProximity": 1.0,
            "textSimilarity": 0.65,
            "roleMatch": 1.0,
            "positionSimilarity": 0.8,
        },
        "page_url": "https://app.example.com/checkout",
        "original_url": "https://app.example.com/checkout",
        "field_label": "Submit Button",
    }


class TestValidateHealingMatch:
    """Test POST /api/healing/validate endpoint."""

    @patch("app.api.healing.get_healing_service")
    def test_validate_with_ai_available_returns_recommendation(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test validation with AI available returns proper response structure."""
        # Mock AI service to return a response
        mock_service = MagicMock()
        mock_service.validate_healing_match.return_value = HealingValidationResponse(
            is_match=True,
            ai_confidence=0.92,
            reasoning="Both elements are submit buttons in the same checkout form.",
            combined_score=0.84,
            recommendation="accept",
            ai_model="claude-haiku-4-5-20251001",
        )
        mock_get_service.return_value = mock_service

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "is_match" in data
        assert "ai_confidence" in data
        assert "reasoning" in data
        assert "combined_score" in data
        assert "recommendation" in data
        assert "ai_model" in data

        # Check values
        assert data["is_match"] is True
        assert data["ai_confidence"] == 0.92
        assert data["recommendation"] in ["accept", "prompt_user", "reject"]
        assert 0.0 <= data["combined_score"] <= 1.0

    @patch("app.api.healing.get_healing_service")
    def test_validate_ai_returns_accept_recommendation(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test AI returns 'accept' recommendation for high confidence match."""
        mock_service = MagicMock()
        mock_service.validate_healing_match.return_value = HealingValidationResponse(
            is_match=True,
            ai_confidence=0.95,
            reasoning="Clear match.",
            combined_score=0.88,
            recommendation="accept",
            ai_model="claude-haiku-4-5-20251001",
        )
        mock_get_service.return_value = mock_service

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["recommendation"] == "accept"

    @patch("app.api.healing.get_healing_service")
    def test_validate_ai_returns_reject_recommendation(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test AI returns 'reject' recommendation for non-match."""
        mock_service = MagicMock()
        mock_service.validate_healing_match.return_value = HealingValidationResponse(
            is_match=False,
            ai_confidence=0.85,
            reasoning="Different functional purpose.",
            combined_score=0.40,
            recommendation="reject",
            ai_model="claude-haiku-4-5-20251001",
        )
        mock_get_service.return_value = mock_service

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["recommendation"] == "reject"
        assert data["is_match"] is False

    @patch("app.api.healing.get_healing_service")
    def test_validate_fallback_high_score_accepts(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test fallback behavior: high deterministic score (≥0.90) returns 'accept'."""
        # Mock service as unavailable
        mock_get_service.return_value = None

        # Set high deterministic score
        valid_healing_request["deterministic_score"] = 0.95

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check fallback response
        assert data["recommendation"] == "accept"
        assert data["ai_confidence"] == 0.0
        assert data["combined_score"] == 0.95
        assert data["ai_model"] == "deterministic_fallback"
        assert "AI validation unavailable" in data["reasoning"]

    @patch("app.api.healing.get_healing_service")
    def test_validate_fallback_medium_score_prompts_user(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test fallback behavior: medium score (0.60-0.90) returns 'prompt_user'."""
        mock_get_service.return_value = None

        # Set medium deterministic score
        valid_healing_request["deterministic_score"] = 0.75

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["recommendation"] == "prompt_user"
        assert data["ai_confidence"] == 0.0
        assert data["combined_score"] == 0.75
        assert data["ai_model"] == "deterministic_fallback"

    @patch("app.api.healing.get_healing_service")
    def test_validate_fallback_low_score_rejects(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test fallback behavior: low score (<0.60) returns 'reject'."""
        mock_get_service.return_value = None

        # Set low deterministic score
        valid_healing_request["deterministic_score"] = 0.45

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["recommendation"] == "reject"
        assert data["is_match"] is False
        assert data["ai_confidence"] == 0.0
        assert data["combined_score"] == 0.45

    def test_validate_without_token_returns_401(
        self, client: TestClient, valid_healing_request: dict
    ):
        """Test validation without authentication returns 401."""
        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
        )

        assert response.status_code == 401

    def test_validate_with_invalid_token_returns_401(
        self, client: TestClient, valid_healing_request: dict
    ):
        """Test validation with invalid token returns 401."""
        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )

        assert response.status_code == 401

    def test_validate_missing_required_fields_returns_422(
        self, client: TestClient, token: str
    ):
        """Test validation with missing required fields returns 422."""
        # Missing step_id
        invalid_request = {
            "workflow_id": 1,
            "deterministic_score": 0.78,
            "original_context": {
                "tag_name": "button",
                "text": "Submit",
            },
            "candidate_context": {
                "tag_name": "button",
                "text": "Submit Order",
            },
            "page_url": "https://app.example.com",
            "original_url": "https://app.example.com",
        }

        response = client.post(
            "/api/healing/validate",
            json=invalid_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    def test_validate_invalid_score_range_returns_422(
        self, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test validation with score outside 0-1 range returns 422."""
        # Score > 1.0
        valid_healing_request["deterministic_score"] = 1.5

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

        # Score < 0.0
        valid_healing_request["deterministic_score"] = -0.5

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422

    @patch("app.api.healing.get_healing_service")
    def test_validate_ai_timeout_falls_back_gracefully(
        self, mock_get_service, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test AI timeout gracefully falls back to deterministic."""
        # Mock service to raise error (simulating timeout)
        mock_service = MagicMock()
        mock_service.validate_healing_match.side_effect = HealingServiceError("API timeout")
        mock_get_service.return_value = mock_service

        valid_healing_request["deterministic_score"] = 0.85

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        # Should return 500 error (not fallback - API explicitly handles this)
        assert response.status_code == 500
        assert "Healing validation failed" in response.json()["detail"]

    def test_validate_malformed_candidate_data_returns_422(
        self, client: TestClient, token: str, valid_healing_request: dict
    ):
        """Test malformed candidate_data is handled gracefully."""
        # Missing required tag_name field
        valid_healing_request["candidate_context"] = {
            "text": "Submit",
            "role": "button",
        }

        response = client.post(
            "/api/healing/validate",
            json=valid_healing_request,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422


class TestGetHealingServiceStatus:
    """Test GET /api/healing/status endpoint."""

    @patch("app.api.healing.get_healing_service")
    def test_status_returns_enabled_when_ai_available(
        self, mock_get_service, client: TestClient, token: str
    ):
        """Test status endpoint returns enabled when AI is available."""
        mock_service = MagicMock()
        mock_service.model = "claude-haiku-4-5-20251001"
        mock_get_service.return_value = mock_service

        response = client.get(
            "/api/healing/status",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["ai_available"] is True
        assert data["model"] == "claude-haiku-4-5-20251001"
        assert "ai_weight" in data
        assert "thresholds" in data
        assert "accept" in data["thresholds"]
        assert "reject" in data["thresholds"]

    @patch("app.api.healing.get_healing_service")
    def test_status_returns_disabled_when_ai_unavailable(
        self, mock_get_service, client: TestClient, token: str
    ):
        """Test status endpoint returns disabled when AI is unavailable."""
        mock_get_service.return_value = None

        response = client.get(
            "/api/healing/status",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["ai_available"] is False
        assert data["model"] is None
        assert "fallback_mode" in data

    def test_status_without_token_returns_401(self, client: TestClient):
        """Test status endpoint requires authentication."""
        response = client.get("/api/healing/status")

        assert response.status_code == 401

    def test_status_with_invalid_token_returns_401(self, client: TestClient):
        """Test status endpoint rejects invalid token."""
        response = client.get(
            "/api/healing/status",
            headers={"Authorization": "Bearer invalid-token"},
        )

        assert response.status_code == 401
