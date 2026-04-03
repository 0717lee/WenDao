# -*- coding: utf-8 -*-
"""
Document router path regression tests.
"""
import os
import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy agent modules before imports
sys.modules['agents.router'] = MagicMock()
sys.modules['agents.speech'] = MagicMock()


class TestDocumentRouterPaths:
    def test_static_document_routes_are_not_shadowed_by_document_id(self):
        from routers.document import router
        from core.auth import require_auth

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}
        client = TestClient(app)

        with patch("routers.document._get_recommendations", new=AsyncMock(return_value=[])), \
             patch("routers.document._resolve_citation_reference", new=AsyncMock(return_value=None)):
            recommendations = client.get("/api/v1/documents/recommendations?limit=4")
            citation = client.get("/api/v1/documents/resolve-citation?title=%E8%AE%BA%E8%AF%AD&source=%E5%AD%A6%E8%80%8C%E7%AF%87")

        assert recommendations.status_code == 200
        assert recommendations.json()["documents"] == []
        assert citation.status_code == 200
        assert citation.json() == {"match": None}
