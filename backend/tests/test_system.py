def login_admin(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"},
    )
    assert response.status_code == 200


def test_system_status_and_notifications(client, db):
    login_admin(client)
    status = client.get("/api/system/status")
    assert status.status_code == 200
    assert status.json()["transcription_provider"] == "Google Gemini"
    notices = client.get("/api/system/notifications")
    assert notices.status_code == 200
    assert "count" in notices.json()
    assert isinstance(notices.json()["items"], list)


def test_admin_can_read_audit_and_create_backup(client, db):
    login_admin(client)
    audit = client.get("/api/system/audit")
    assert audit.status_code == 200
    backup = client.post("/api/system/backups")
    assert backup.status_code == 200
    assert backup.json()["status"] == "validated"
    listing = client.get("/api/system/backups")
    assert listing.status_code == 200
    assert len(listing.json()) >= 1
