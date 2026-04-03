# -*- coding: utf-8 -*-
"""
Auth API unit tests.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


class TestAuthMe:
    @pytest.mark.asyncio
    async def test_get_current_user_returns_identity(self):
        from routers.auth import get_current_user

        result = await get_current_user({"sub": "user-1", "username": "tester"})

        assert result.user_id == "user-1"
        assert result.username == "tester"


class TestJwtSecret:
    def test_get_jwt_secret_raises_without_env_outside_dev(self, monkeypatch):
        from core.auth import get_jwt_secret

        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("WENDAO_ENV", raising=False)
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)

        with pytest.raises(RuntimeError):
            get_jwt_secret()

    def test_get_jwt_secret_allows_insecure_default_in_dev(self, monkeypatch):
        from core.auth import DEFAULT_JWT_SECRET, get_jwt_secret

        monkeypatch.delenv("JWT_SECRET", raising=False)
        monkeypatch.setenv("APP_ENV", "development")

        assert get_jwt_secret() == DEFAULT_JWT_SECRET
