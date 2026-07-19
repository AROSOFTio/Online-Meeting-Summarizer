import os
import pytest

# Set env vars for testing before importing components
os.environ["DATABASE_URL"] = "sqlite:///./test_meeting_summarizer.db"
os.environ["ADMIN_EMAIL"] = "testadmin@starlight.sc.ug"
os.environ["ADMIN_PASSWORD"] = "TestAdminPass123!"
os.environ["TESTING"] = "true"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base, engine
from app.core.deps import get_db
from app.main import app

# Ensure tables are created in the test db
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    db_session = TestingSessionLocal()
    try:
        yield db_session
    finally:
        db_session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    
    # Cleanup test db file if it exists
    if os.path.exists("./test_meeting_summarizer.db"):
        try:
            os.remove("./test_meeting_summarizer.db")
        except Exception:
            pass
