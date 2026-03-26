"""Manual catalog verification helper.

This is intentionally not named like an automated pytest module because the
formal backend test entrypoint lives under ``tests/``.
"""

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_get_catalog():
    response = client.get("/api/v1/catalog")
    assert response.status_code == 200
    
    data = response.json()
    assert "residential" in data
    assert "official" in data
    assert "imperial" in data
    assert "bridge" in data
    
    # 验证是否包含佛教字眼
    json_str = response.text
    assert "temple" not in json_str.lower()
    assert "寺庙" not in json_str
    
    print("Catalog API is validated with compliance whitelist.")
