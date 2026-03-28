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
