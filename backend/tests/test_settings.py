from app.models.models import User, UserRole

def test_settings_read_and_update(client, db):
    # 1. Login as admin
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    
    # Read settings
    get_resp = client.get("/api/settings/")
    assert get_resp.status_code == 200
    settings = get_resp.json()
    assert settings["school_name"] == "Starlight Secondary School"
    assert settings["timezone"] == "Africa/Kampala"
    
    # Update settings
    update_data = {
        "school_name": "Starlight Secondary School Amuria",
        "timezone": "Africa/Kampala",
        "whisper_model": "tiny"
    }
    put_resp = client.put("/api/settings/", json=update_data)
    assert put_resp.status_code == 200
    updated_settings = put_resp.json()
    assert updated_settings["school_name"] == "Starlight Secondary School Amuria"
    assert updated_settings["whisper_model"] == "tiny"

def test_staff_cannot_update_settings(client, db):
    # 1. Login as admin to create a staff member
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    staff_data = {
        "email": "settings_staff@starlight.sc.ug",
        "full_name": "Settings Staff",
        "role": "staff",
        "is_active": True,
        "password": "StaffPassword123!"
    }
    client.post("/api/staff/", json=staff_data)
    client.post("/api/auth/logout")

    # 2. Login as staff
    client.post(
        "/api/auth/login",
        data={"username": "settings_staff@starlight.sc.ug", "password": "StaffPassword123!"}
    )
    
    # Staff can read settings
    get_resp = client.get("/api/settings/")
    assert get_resp.status_code == 200
    
    # Staff cannot update settings - should get 403 Forbidden
    update_data = {"school_name": "Hacked Name"}
    put_resp = client.put("/api/settings/", json=update_data)
    assert put_resp.status_code == 403
