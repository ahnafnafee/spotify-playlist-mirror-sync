"""Web layer smoke tests (FastAPI TestClient)."""

from fastapi.testclient import TestClient

from spotify_mirror.web import create_app


def test_health():
    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
