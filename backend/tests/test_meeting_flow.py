from datetime import datetime, timedelta, timezone

from app.workers.tasks import _local_minutes


def login_admin(client):
    response = client.post(
        "/api/auth/login",
        data={"username": "testadmin@starlight.sc.ug", "password": "TestAdminPass123!"},
    )
    assert response.status_code == 200


def create_scheduled_meeting(client, title="Flow Test Meeting"):
    response = client.post(
        "/api/meetings/",
        json={
            "title": title,
            "description": "",
            "date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "participants": [],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def invitation_code(link: str) -> str:
    return link.rstrip("/").split("/")[-1]


def test_known_directory_person_waits_then_becomes_present(client):
    login_admin(client)
    staff = client.post(
        "/api/staff/",
        json={
            "email": "director@starlight.sc.ug",
            "full_name": "Grace Director",
            "role": "staff",
            "is_active": True,
            "password": "StrongPass123!",
            "directory_group": "Directors",
            "position_title": "Board Director",
        },
    )
    assert staff.status_code == 201
    staff_id = staff.json()["id"]

    meeting_id = create_scheduled_meeting(client)
    invitations = client.post(
        f"/api/meetings/{meeting_id}/invitations",
        json={"user_ids": [staff_id], "emails": [], "send_email": False},
    )
    assert invitations.status_code == 200
    personal = invitations.json()["invitations"][0]
    code = invitation_code(personal["link"])

    public = client.get(f"/api/meetings/public/invitations/{code}")
    assert public.status_code == 200
    assert public.json()["requires_name"] is False
    assert public.json()["known_name"] == "Grace Director"
    assert public.json()["known_position"] == "Board Director"
    assert public.json()["lifecycle"] == "scheduled"

    waiting = client.post(f"/api/meetings/public/invitations/{code}/join", json={})
    assert waiting.status_code == 200
    assert waiting.json()["attendance_status"] == "waiting"

    attendance = client.get(f"/api/meetings/{meeting_id}/attendance").json()
    assert attendance[0]["name"] == "Grace Director"
    assert attendance[0]["attendance_status"] == "waiting"

    started = client.post(f"/api/meetings/{meeting_id}/start")
    assert started.status_code == 200
    assert started.json()["lifecycle"] == "live"

    entered = client.post(f"/api/meetings/public/invitations/{code}/join", json={})
    assert entered.status_code == 200
    assert entered.json()["attendance_status"] == "present"

    attendance = client.get(f"/api/meetings/{meeting_id}/attendance").json()
    assert attendance[0]["attendance_status"] == "present"


def test_general_guest_needs_only_full_name_and_no_acceptance(client):
    login_admin(client)
    meeting_id = create_scheduled_meeting(client, "Guest Flow Meeting")
    invitations = client.post(
        f"/api/meetings/{meeting_id}/invitations",
        json={"user_ids": [], "emails": [], "send_email": False},
    )
    assert invitations.status_code == 200
    code = invitation_code(invitations.json()["general_link"])

    public = client.get(f"/api/meetings/public/invitations/{code}")
    assert public.status_code == 200
    assert public.json()["requires_name"] is True

    missing_name = client.post(f"/api/meetings/public/invitations/{code}/join", json={})
    assert missing_name.status_code == 400
    assert "full name" in missing_name.json()["detail"].lower()

    waiting = client.post(
        f"/api/meetings/public/invitations/{code}/join",
        json={"full_name": "Sarah Guest"},
    )
    assert waiting.status_code == 200
    assert waiting.json()["attendance_status"] == "waiting"
    assert waiting.json()["name"] == "Sarah Guest"

    client.post(f"/api/meetings/{meeting_id}/start")
    present = client.post(
        f"/api/meetings/public/invitations/{code}/join",
        json={"full_name": "Sarah Guest"},
    )
    assert present.status_code == 200
    assert present.json()["attendance_status"] == "present"


def test_minutes_fallback_always_returns_agenda():
    result = _local_minutes(
        "The team reviewed student examination performance. Staff punctuality was then discussed."
    )
    assert result["agenda"]
    assert all(str(item).strip() for item in result["agenda"])
