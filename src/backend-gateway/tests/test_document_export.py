# -*- coding: utf-8 -*-
"""
Tests for document export (PDF/TXT) and word explain API endpoint.
All database and agent dependencies are mocked.
"""
import os
import sys
import json
import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _auth_headers():
    from core.auth import create_token

    token = create_token("test-user", "tester")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_pg_pool():
    """Mock asyncpg pool + connection for document queries."""
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(
        return_value={
            "id": "test-uuid-123",
            "title": "test_document",
            "original_text": "天命之谓性率性之谓道修道之谓教",
            "punctuated_text": "天命之谓性，率性之谓道，修道之谓教。",
            "translated_text": "上天赋予的叫做性，顺着本性行事叫做道，修养道德叫做教。",
            "source_type": "corpus",
        }
    )

    acm = MagicMock()
    acm.__aenter__ = AsyncMock(return_value=mock_conn)
    acm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=acm)
    mock_pool.close = AsyncMock()

    return mock_pool


@pytest.fixture
def mock_pg_pool_not_found():
    """Mock asyncpg pool that returns None (document not found)."""
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)

    acm = MagicMock()
    acm.__aenter__ = AsyncMock(return_value=mock_conn)
    acm.__aexit__ = AsyncMock(return_value=False)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=acm)

    return mock_pool


class TestExportTxt:
    """GET /export/{id}?format=txt returns plain text with all sections"""

    @pytest.mark.asyncio
    async def test_export_txt(self, mock_pg_pool, monkeypatch):
        from core import pg_database
        from core.auth import require_auth

        monkeypatch.setattr(pg_database, "pool", mock_pg_pool)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/test-uuid-123?format=txt")

        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        body = resp.text
        assert "天命之谓性率性之谓道修道之谓教" in body
        assert "天命之谓性，率性之谓道，修道之谓教。" in body
        assert "上天赋予的叫做性" in body


class TestExportPdf:
    """GET /export/{id}?format=pdf returns a PDF response"""

    @pytest.mark.asyncio
    async def test_export_pdf(self, mock_pg_pool, monkeypatch):
        from core import pg_database
        from core.auth import require_auth

        monkeypatch.setattr(pg_database, "pool", mock_pg_pool)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/test-uuid-123?format=pdf")

        assert resp.status_code == 200
        assert "application/pdf" in resp.headers["content-type"]
        # PDF starts with %PDF marker
        assert resp.content[:4] == b"%PDF"


class TestExportNotFound:
    """GET /export/{id} for non-existent document returns 404"""

    @pytest.mark.asyncio
    async def test_export_not_found(self, mock_pg_pool_not_found, monkeypatch):
        from core import pg_database
        from core.auth import require_auth

        monkeypatch.setattr(pg_database, "pool", mock_pg_pool_not_found)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/nonexistent-id?format=txt")

        assert resp.status_code == 404


class TestExplainEndpoint:
    """POST /explain returns word explanation"""

    @pytest.mark.asyncio
    async def test_explain_endpoint(self, monkeypatch):
        # Mock the WordExplainerAgent before importing the router
        mock_agent = Mock()
        mock_agent.explain_word = AsyncMock(
            return_value={
                "meaning": "以民为本的治国主张",
                "allusion": "见于《孟子·梁惠王上》",
                "citations": [],
            }
        )

        with patch("routers.document.word_explainer", mock_agent):
            from httpx import ASGITransport, AsyncClient
            from routers.document import router
            from fastapi import FastAPI

            app = FastAPI()
            app.include_router(router)

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/documents/explain?word=仁政&context=孟子政治思想",
                    headers=_auth_headers(),
                )

            assert resp.status_code == 200
            data = resp.json()
            assert "meaning" in data
            assert "allusion" in data


class TestExportEmptyDocument:
    """Export empty document returns valid response with empty content"""

    @pytest.mark.asyncio
    async def test_export_empty_document(self, monkeypatch):
        from core.auth import require_auth
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(
            return_value={
                "id": "empty-doc",
                "title": "empty",
                "original_text": "",
                "punctuated_text": "",
                "translated_text": "",
                "source_type": "corpus",
            }
        )
        acm = MagicMock()
        acm.__aenter__ = AsyncMock(return_value=mock_conn)
        acm.__aexit__ = AsyncMock(return_value=False)
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=acm)

        from core import pg_database
        monkeypatch.setattr(pg_database, "pool", mock_pool)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/empty-doc?format=txt")

        assert resp.status_code == 200


class TestExportCJKCharacters:
    """Export with CJK characters validates font fallback for PDF"""

    @pytest.mark.asyncio
    async def test_export_cjk_pdf(self, mock_pg_pool, monkeypatch):
        from core import pg_database
        from core.auth import require_auth
        monkeypatch.setattr(pg_database, "pool", mock_pg_pool)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/test-uuid-123?format=pdf")

        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
        # PDF should be non-trivial size (font + CJK content)
        assert len(resp.content) > 100


class TestExportTxtContent:
    """TXT export contains all three sections correctly"""

    @pytest.mark.asyncio
    async def test_export_txt_content_sections(self, mock_pg_pool, monkeypatch):
        from core import pg_database
        from core.auth import require_auth
        monkeypatch.setattr(pg_database, "pool", mock_pg_pool)

        from httpx import ASGITransport, AsyncClient
        from routers.document import router
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[require_auth] = lambda: {"sub": "user-1"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/documents/export/test-uuid-123?format=txt")

        body = resp.text
        # Should contain section headers or all three text types
        assert "天命之谓性率性之谓道修道之谓教" in body
        assert "天命之谓性，率性之谓道，修道之谓教。" in body
        assert "上天赋予的叫做性" in body


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
