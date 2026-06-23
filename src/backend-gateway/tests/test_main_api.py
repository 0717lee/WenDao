from fastapi.testclient import TestClient

from main import app
from main import _make_json_safe
from main import _resolve_pg_seed_mode, _should_sync_sqlite_corpus


client = TestClient(app, raise_server_exceptions=False)


def test_health_endpoint_returns_minimal_payload():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_global_exception_handler_hides_internal_details():
    route_path = "/__test/boom"
    if not any(getattr(route, "path", None) == route_path for route in app.routes):
        async def boom():
            raise RuntimeError("sensitive stack detail")

        app.add_api_route(route_path, boom, methods=["GET"])

    response = client.get(route_path)
    data = response.json()

    assert response.status_code == 500
    assert data["message"] == "服务器内部错误，请稍后重试"
    assert "sensitive stack detail" not in data["detail"]


def test_resolve_pg_seed_mode_skips_pg_corpus_seed_when_sqlite_is_empty():
    assert _resolve_pg_seed_mode(0) == "none"
    assert _resolve_pg_seed_mode(100) is None


def test_make_json_safe_converts_validation_error_objects_to_strings():
    data = [
        {
            "type": "value_error",
            "ctx": {
                "error": ValueError("字段不能为空"),
            },
        }
    ]

    result = _make_json_safe(data)

    assert result[0]["ctx"]["error"] == "字段不能为空"


def test_login_empty_fields_returns_422_instead_of_500():
    response = client.post("/api/v1/auth/login", json={"username": "", "password": ""})
    data = response.json()

    assert response.status_code == 422
    assert data["detail"] == "验证错误"
    assert data["details"][0]["ctx"]["error"] == "字段不能为空"


def test_should_sync_sqlite_corpus_respects_free_deploy_mode(monkeypatch):
    monkeypatch.setenv("SQLITE_CORPUS_SEED_MODE", "none")

    assert _should_sync_sqlite_corpus(0) is False


def test_should_sync_sqlite_corpus_keeps_default_background_sync(monkeypatch):
    monkeypatch.delenv("SQLITE_CORPUS_SEED_MODE", raising=False)

    assert _should_sync_sqlite_corpus(0) is True
    assert _should_sync_sqlite_corpus(10) is False
