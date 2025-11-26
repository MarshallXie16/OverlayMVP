"""
Tests for health logging service.
BE-011: Health Log Execution Endpoint
"""
import pytest
from datetime import datetime
from app.services.health import log_workflow_execution, BROKEN_THRESHOLD
from app.schemas.health import ExecutionLogRequest
from app.models.workflow import Workflow
from app.models.user import User
from app.models.company import Company
from app.models.health_log import HealthLog


def test_log_successful_execution(db_session):
    """Test logging successful execution updates metrics correctly"""
    # Create test data
    company = Company(name="Test Company")
    db_session.add(company)
    db_session.flush()
    
    user = User(
        email="test@example.com",
        hashed_password="fake_hash",
        name="Test User",
        role="admin",
        company_id=company.id
    )
    db_session.add(user)
    db_session.flush()
    
    workflow = Workflow(
        company_id=company.id,
        created_by=user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="active",
        success_rate=0.8,
        total_uses=5,
        consecutive_failures=2
    )
    db_session.add(workflow)
    db_session.commit()
    
    # Log successful execution
    execution_data = ExecutionLogRequest(
        status="success",
        page_url="https://example.com/step1",
        execution_time_ms=1500
    )
    
    health_log, updated_workflow = log_workflow_execution(
        db=db_session,
        workflow_id=workflow.id,
        user_id=user.id,
        execution_data=execution_data
    )
    
    # Verify health log created
    assert health_log.id is not None
    assert health_log.workflow_id == workflow.id
    assert health_log.user_id == user.id
    assert health_log.status == "success"
    assert health_log.execution_time_ms == 1500
    
    # Verify workflow metrics updated
    assert updated_workflow.total_uses == 6  # Incremented
    assert updated_workflow.consecutive_failures == 0  # Reset on success
    assert updated_workflow.success_rate > 0.8  # Should increase
    assert updated_workflow.last_successful_run is not None


def test_log_failed_execution(db_session):
    """Test logging failed execution increments failures"""
    # Create test data
    company = Company(name="Test Company")
    db_session.add(company)
    db_session.flush()
    
    user = User(
        email="test@example.com",
        hashed_password="fake_hash",
        name="Test User",
        role="admin",
        company_id=company.id
    )
    db_session.add(user)
    db_session.flush()
    
    workflow = Workflow(
        company_id=company.id,
        created_by=user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="active",
        success_rate=0.9,
        total_uses=10,
        consecutive_failures=0
    )
    db_session.add(workflow)
    db_session.commit()
    
    # Log failed execution
    execution_data = ExecutionLogRequest(
        status="failed",
        error_type="element_not_found",
        error_message="Could not find element with selector #submit-btn",
        page_url="https://example.com/submit"
    )
    
    health_log, updated_workflow = log_workflow_execution(
        db=db_session,
        workflow_id=workflow.id,
        user_id=user.id,
        execution_data=execution_data
    )
    
    # Verify health log created
    assert health_log.status == "failed"
    assert health_log.error_type == "element_not_found"
    assert health_log.error_message is not None
    
    # Verify workflow metrics updated
    assert updated_workflow.total_uses == 11
    assert updated_workflow.consecutive_failures == 1  # Incremented
    assert updated_workflow.success_rate < 0.9  # Should decrease
    assert updated_workflow.last_failed_run is not None
    assert updated_workflow.status == "active"  # Not broken yet


def test_workflow_marked_broken_after_threshold(db_session):
    """Test workflow status changes to broken after consecutive failures"""
    # Create test data
    company = Company(name="Test Company")
    db_session.add(company)
    db_session.flush()
    
    user = User(
        email="test@example.com",
        hashed_password="fake_hash",
        name="Test User",
        role="admin",
        company_id=company.id
    )
    db_session.add(user)
    db_session.flush()
    
    workflow = Workflow(
        company_id=company.id,
        created_by=user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="active",
        success_rate=0.5,
        total_uses=10,
        consecutive_failures=BROKEN_THRESHOLD - 1  # One away from broken
    )
    db_session.add(workflow)
    db_session.commit()
    
    # Log one more failure
    execution_data = ExecutionLogRequest(
        status="failed",
        error_type="timeout",
        error_message="Execution timed out"
    )
    
    health_log, updated_workflow = log_workflow_execution(
        db=db_session,
        workflow_id=workflow.id,
        user_id=user.id,
        execution_data=execution_data
    )
    
    # Verify workflow marked as broken
    assert updated_workflow.consecutive_failures == BROKEN_THRESHOLD
    assert updated_workflow.status == "broken"


def test_success_after_broken_resets_status(db_session):
    """Test successful execution after broken changes status back to active"""
    # Create test data
    company = Company(name="Test Company")
    db_session.add(company)
    db_session.flush()
    
    user = User(
        email="test@example.com",
        hashed_password="fake_hash",
        name="Test User",
        role="admin",
        company_id=company.id
    )
    db_session.add(user)
    db_session.flush()
    
    workflow = Workflow(
        company_id=company.id,
        created_by=user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="broken",
        success_rate=0.3,
        total_uses=20,
        consecutive_failures=5
    )
    db_session.add(workflow)
    db_session.commit()
    
    # Log successful execution
    execution_data = ExecutionLogRequest(
        status="success",
        page_url="https://example.com"
    )
    
    health_log, updated_workflow = log_workflow_execution(
        db=db_session,
        workflow_id=workflow.id,
        user_id=user.id,
        execution_data=execution_data
    )
    
    # Verify workflow status restored
    assert updated_workflow.consecutive_failures == 0
    assert updated_workflow.status == "active"  # Changed back from broken


def test_healed_execution_counts_as_success(db_session):
    """Test healed execution (deterministic/AI) counts as success"""
    # Create test data
    company = Company(name="Test Company")
    db_session.add(company)
    db_session.flush()
    
    user = User(
        email="test@example.com",
        hashed_password="fake_hash",
        name="Test User",
        role="admin",
        company_id=company.id
    )
    db_session.add(user)
    db_session.flush()
    
    workflow = Workflow(
        company_id=company.id,
        created_by=user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="active",
        success_rate=0.8,
        total_uses=10,
        consecutive_failures=1
    )
    db_session.add(workflow)
    db_session.commit()
    
    # Log healed execution
    execution_data = ExecutionLogRequest(
        status="healed_deterministic",
        healing_confidence=0.95,
        deterministic_score=85,
        candidates_evaluated=3
    )
    
    health_log, updated_workflow = log_workflow_execution(
        db=db_session,
        workflow_id=workflow.id,
        user_id=user.id,
        execution_data=execution_data
    )
    
    # Verify treated as success
    assert health_log.status == "healed_deterministic"
    assert health_log.healing_confidence == 0.95
    assert updated_workflow.consecutive_failures == 0  # Reset
    assert updated_workflow.success_rate > 0.8  # Increased
