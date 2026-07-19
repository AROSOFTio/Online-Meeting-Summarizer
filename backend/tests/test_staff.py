from app.models.models import User, UserRole

def test_admin_manage_staff(client, db):
    # Login as admin
    admin_login = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    assert admin_login.status_code == 200

    # 1. Create staff
    staff_data = {
        "email": "staff1@starlight.sc.ug",
        "full_name": "Starlight Staff One",
        "role": "staff",
        "is_active": True,
        "password": "StaffPassword123!"
    }
    create_resp = client.post("/api/staff/", json=staff_data)
    assert create_resp.status_code == 201
    created_user = create_resp.json()
    assert created_user["email"] == "staff1@starlight.sc.ug"
    assert created_user["role"] == "staff"

    # 2. Get staff list
    list_resp = client.get("/api/staff/")
    assert list_resp.status_code == 200
    staff_list = list_resp.json()
    # At least two users (the seeded admin + the newly created staff)
    assert len(staff_list) >= 2

    # 3. Update staff details
    staff_id = created_user["id"]
    update_data = {
        "full_name": "Updated Staff One Name"
    }
    update_resp = client.put(f"/api/staff/{staff_id}", json=update_data)
    assert update_resp.status_code == 200
    updated_user = update_resp.json()
    assert updated_user["full_name"] == "Updated Staff One Name"

    # 4. Deactivate staff
    deactivate_resp = client.delete(f"/api/staff/{staff_id}")
    assert deactivate_resp.status_code == 200
    deactivated_user = deactivate_resp.json()
    assert deactivated_user["is_active"] is False

def test_staff_cannot_access_staff_apis(client, db):
    # Create a staff member using admin
    admin_login = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    staff_data = {
        "email": "staff_test@starlight.sc.ug",
        "full_name": "Starlight Staff Test",
        "role": "staff",
        "is_active": True,
        "password": "StaffPassword123!"
    }
    client.post("/api/staff/", json=staff_data)
    
    # Logout admin
    client.post("/api/auth/logout")

    # Login as the newly created staff member
    staff_login = client.post(
        "/api/auth/login",
        data={"username": "staff_test@starlight.sc.ug", "password": "StaffPassword123!"}
    )
    assert staff_login.status_code == 200

    # Try to access list staff - should get 403 Forbidden
    list_resp = client.get("/api/staff/")
    assert list_resp.status_code == 403
    assert list_resp.json()["detail"] == "The user does not have administrator privileges"

    # Try to create staff - should get 403 Forbidden
    create_resp = client.post("/api/staff/", json=staff_data)
    assert create_resp.status_code == 403

def test_admin_cannot_deactivate_self(client):
    # Login as admin
    client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"}
    )
    me_resp = client.get("/api/auth/me")
    admin_id = me_resp.json()["id"]

    # Try to deactivate self - should raise 400 Bad Request
    deactivate_resp = client.delete(f"/api/staff/{admin_id}")
    assert deactivate_resp.status_code == 400
    assert deactivate_resp.json()["detail"] == "Admins cannot deactivate themselves"
