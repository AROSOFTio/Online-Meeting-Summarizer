from app.core import security
from app.models.models import User, UserRole

def test_seeded_admin_login(client, db):
    # Retrieve the seeded admin from the db (lifespan seeds it on startup)
    # Note: lifespan seed is called on client startup
    admin = db.query(User).filter(User.email == "testadmin@starlight.sc.ug").first()
    assert admin is not None
    assert admin.role == UserRole.admin

    # Perform login
    response = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    assert response.status_code == 200
    json_data = response.json()
    assert "access_token" in json_data
    
    # Assert session cookie is set
    assert "session_token" in response.cookies
    cookie_val = response.cookies["session_token"]
    assert cookie_val is not None

def test_login_invalid_credentials(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "wrong@starlight.sc.ug", "password": "wrongpassword"}
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Incorrect email or password"

def test_get_me_profile(client):
    # First login to set cookie
    login_resp = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    assert login_resp.status_code == 200
    
    # Call me profile
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    profile = response.json()
    assert profile["email"] == "testadmin@starlight.sc.ug"
    assert profile["role"] == "admin"

def test_logout(client):
    # Login
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    assert "session_token" in client.cookies
    
    # Logout
    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200
    
    # Assert session token cookie is deleted / cleared
    # Depending on client, cookies might show expired or be removed
    cookie = client.cookies.get("session_token")
    assert cookie is None or cookie == ""
