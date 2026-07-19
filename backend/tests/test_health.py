def test_health_check(client):
    response = client.get("/api/health")
    # It might return degraded (due to Redis not running on host), but status should be 200/500 depending on DB health
    # Since DB is healthy, it should return 200 or degraded. If it raises a 500, it's because DB is unhealthy.
    # Here, SQLite DB is healthy.
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["database"] == "healthy"
    assert "status" in json_data
