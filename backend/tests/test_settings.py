def test_public_branding_is_available_without_login(client):
    response = client.get("/api/settings/branding")
    assert response.status_code == 200
    branding = response.json()
    assert branding["product_name"] == "ConveneCore"
    assert branding["product_mark_url"] == "/convenecore-mark.svg"
    assert branding["organization_name"] == "Starlight Secondary School"
    assert branding["minutes_document_title"] == "Official Meeting Minutes"


def test_settings_read_and_update(client, db):
    client.post("/api/auth/login", data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"})
    get_resp = client.get("/api/settings/")
    assert get_resp.status_code == 200
    settings = get_resp.json()
    assert settings["organization_name"] == "Starlight Secondary School"
    assert settings["school_name"] == "Starlight Secondary School"  # legacy alias
    assert settings["minutes_style"] == "Standard Professional"
    assert settings["timezone"] == "Africa/Kampala"
    retired_model_key = "whis" + "per_model"
    assert retired_model_key not in settings

    update_data = {
        "organization_name": "Example Global Organization",
        "organization_type": "NGO / Nonprofit",
        "minutes_document_title": "Record of Proceedings",
        "minutes_style": "NGO / Nonprofit",
        "minutes_language": "English",
        "decisions_label": "Resolutions",
        "action_items_label": "Follow-up Actions",
        "timezone": "Europe/London",
        "retention_period_days": "730",
    }
    put_resp = client.put("/api/settings/", json=update_data)
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["organization_name"] == "Example Global Organization"
    assert updated["school_name"] == "Example Global Organization"  # compatibility is synchronized
    assert updated["minutes_document_title"] == "Record of Proceedings"
    assert updated["decisions_label"] == "Resolutions"
    assert updated["action_items_label"] == "Follow-up Actions"
    assert updated["timezone"] == "Europe/London"
    assert updated["retention_period_days"] == "730"

    branding_resp = client.get("/api/settings/branding")
    assert branding_resp.status_code == 200
    branding = branding_resp.json()
    assert branding["product_name"] == "ConveneCore"
    assert branding["organization_name"] == "Example Global Organization"
    assert branding["minutes_document_title"] == "Record of Proceedings"

    status_resp = client.get("/api/system/status")
    assert status_resp.status_code == 200
    runtime = status_resp.json()
    assert runtime["transcription_provider"] == "Google Gemini"
    assert runtime["gemini_model"]


def test_legacy_school_name_update_migrates_to_organization_name(client, db):
    client.post("/api/auth/login", data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"})
    put_resp = client.put("/api/settings/", json={"school_name": "Legacy Named Organization"})
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["organization_name"] == "Legacy Named Organization"
    assert updated["school_name"] == "Legacy Named Organization"


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
    assert client.put("/api/settings/", json={"organization_name": "Hacked Name"}).status_code == 403
    assert client.get("/api/system/backups").status_code == 403
