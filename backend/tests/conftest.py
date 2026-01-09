"""
Pytest configuration and fixtures for testing.
"""
import os

# Set TESTING flag before importing app (disables rate limiting)
os.environ["TESTING"] = "true"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from app.main import app
from app.db.base import Base  # Import from db.base to ensure all models are registered
from app.db.session import get_db


# Use in-memory SQLite with StaticPool to ensure same connection is reused
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # Use StaticPool to keep same connection
)


@pytest.fixture(scope="function")
def db() -> Session:
    """
    Create a fresh database for each test function.

    Yields:
        Database session for testing
    """
    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Create session factory bound to engine
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create session
    db_session = TestingSessionLocal()

    try:
        yield db_session
    finally:
        db_session.close()
        # Drop all tables after test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db: Session):
    """
    Create FastAPI test client with test database.

    Args:
        db: Test database session

    Yields:
        TestClient for making API requests
    """

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
