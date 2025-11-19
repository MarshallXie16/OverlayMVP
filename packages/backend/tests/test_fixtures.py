"""Test that fixtures work correctly."""
from sqlalchemy import inspect

def test_db_fixture_creates_tables(db):
    """Test that db fixture creates tables."""
    # Check tables exist
    inspector = inspect(db.bind)
    tables = inspector.get_table_names()
    print(f"Tables in test DB: {tables}")
    assert "users" in tables
    assert "companies" in tables


def test_client_fixture(client, db):
    """Test that client fixture works."""
    # Try a simple request
    response = client.get("/")
    print(f"Response: {response.json()}")
    assert response.status_code == 200

    # Check tables still exist
    inspector = inspect(db.bind)
    tables = inspector.get_table_names()
    print(f"Tables after client request: {tables}")
    assert "users" in tables
