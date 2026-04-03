from fastapi.testclient import TestClient

from main import app


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
