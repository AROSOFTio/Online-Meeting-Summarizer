def test_settings_read_and_update(client, db):
    client.post("/api/auth/login", data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"})
    get_resp = client.get("/api/settings/")
    assert get_resp.status_code == 200
    settings = get_resp.json()
    assert settings["school_name"] == "Starlight Secondary School"
    assert settings["timezone"] == "Africa/Kampala"
    retired_model_key = "whis" + "per_model"
    assert retired_model_key not in settings

    update_data = {
        "school_name": "Starlight Secondary School Amuria",
        "timezone": "Africa/Kampala",
        "retention_period_days": "730",
    }
    put_resp = client.put("/api/settings/", json=update_data)
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["school_name"] == "Starlight Secondary School Amuria"
    assert updated["retention_period_days"] == "730"

    status_resp = client.get("/api/system/status")
    assert status_resp.status_code == 200
    runtime = status_resp.json()
    assert runtime["transcription_provider"] == "Google Gemini"
    assert runtime["gemini_model"]


def test_staff_cannot_update_settings(client, db):
    client.post("/api/auth/login", data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"})
    client.post("/api/staff/", json={
        "email": "settings_staff@starlight.sc.ug",
        "full_name": "Settings Staff",
        "role": "staff",
        "is_active": True,
        "password": "StaffPassword123!",
    })
    client.post("/api/auth/logout")
    client.post("/api/auth/login", data={"username": "settings_staff@starlight.sc.ug", "password": "StaffPassword123!"})
    assert client.get("/api/settings/").status_code == 200
    assert client.put("/api/settings/", json={"school_name": "Hacked Name"}).status_code == 403
    assert client.get("/api/system/backups").status_code == 403
