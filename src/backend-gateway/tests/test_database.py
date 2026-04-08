# -*- coding: utf-8 -*-
"""
数据库模块测试
测试SQLite异步连接管理和Pydantic模型验证
"""
import os
import sys
import pytest
import asyncio
import json
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.database import init_database, get_db
from models.schemas import ChatRequest, ChatResponse, Citation


class TestDatabaseInitialization:
    """测试1: 数据库初始化创建documents和conversations表"""

    @pytest.mark.asyncio
    async def test_init_creates_tables(self):
        test_db = "test_ancient_texts.db"
        # 清理测试数据库
        if os.path.exists(test_db):
            os.remove(test_db)

        await init_database(test_db)

        # 验证数据库文件已创建
        assert os.path.exists(test_db)

        # 验证表结构
        async with get_db(test_db) as db:
            # 检查documents表
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'"
            )
            result = await cursor.fetchone()
            assert result is not None

            # 检查conversations表
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
            )
            result = await cursor.fetchone()
            assert result is not None

            cursor = await db.execute(
                "SELECT COUNT(*) FROM documents WHERE source_type = 'corpus'"
            )
            corpus_count = await cursor.fetchone()
            assert corpus_count[0] >= 100

            cursor = await db.execute("PRAGMA table_info(documents)")
            columns = {row[1] for row in await cursor.fetchall()}
            assert "segments" in columns

        # 清理
        os.remove(test_db)

    @pytest.mark.asyncio
    async def test_init_preserves_corpus_metadata_order(self):
        test_db = "test_ancient_texts.db"
        if os.path.exists(test_db):
            os.remove(test_db)

        await init_database(test_db)

        async with get_db(test_db) as db:
            cursor = await db.execute(
                """
                SELECT title, repo_id, author, dynasty, category, source_name, source_url
                FROM documents
                WHERE source_type = 'corpus'
                ORDER BY title
                LIMIT 1
                """
            )
            row = await cursor.fetchone()

        assert row is not None
        assert row["repo_id"].startswith("KR")
        assert row["source_name"] == "Kanripo"
        assert "kanripo" in row["source_url"].lower()
        assert row["author"] != row["repo_id"]

        os.remove(test_db)

    @pytest.mark.asyncio
    async def test_init_skips_refresh_when_corpus_already_exists_in_auto_mode(self, monkeypatch):
        test_db = "test_ancient_texts.db"
        if os.path.exists(test_db):
            os.remove(test_db)

        await init_database(test_db)

        from core import database as database_module

        fail_loader = lambda: (_ for _ in ()).throw(AssertionError("should not reload corpus documents"))
        monkeypatch.setattr(database_module, "load_corpus_documents", fail_loader)

        await init_database(test_db)

        async with get_db(test_db) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM documents WHERE source_type = 'corpus'")
            corpus_count = await cursor.fetchone()
            assert corpus_count[0] >= 100

        os.remove(test_db)


class TestDatabaseOperations:
    """测试2: 异步插入对话记录成功"""

    @pytest.mark.asyncio
    async def test_insert_conversation(self):
        test_db = "test_ancient_texts.db"
        if os.path.exists(test_db):
            os.remove(test_db)

        await init_database(test_db)

        async with get_db(test_db) as db:
            # 插入对话记录
            citations = [{"title": "《营造法式》", "source": "卷三"}]
            await db.execute(
                """INSERT INTO conversations
                   (user_message, ai_response, citations_json, timestamp)
                   VALUES (?, ?, ?, datetime('now'))""",
                ("什么是斗拱？", "斗拱是中国古建筑的重要构件...", json.dumps(citations, ensure_ascii=False))
            )
            await db.commit()

            # 验证插入成功
            cursor = await db.execute("SELECT * FROM conversations")
            row = await cursor.fetchone()
            assert row is not None
            assert row[1] == "什么是斗拱？"
            assert row[2] == "斗拱是中国古建筑的重要构件..."

        os.remove(test_db)


class TestUserScopedBackfill:
    """测试旧共享数据在单用户时自动回填到用户作用域表。"""

    @pytest.mark.asyncio
    async def test_init_backfills_shared_state_for_single_user(self):
        test_db = "test_ancient_texts.db"
        if os.path.exists(test_db):
            os.remove(test_db)

        await init_database(test_db)

        async with get_db(test_db) as db:
            cursor = await db.execute("SELECT id FROM documents WHERE source_type = 'corpus' LIMIT 1")
            row = await cursor.fetchone()
            document_id = row["id"]

            await db.execute(
                "INSERT INTO users (id, username, email, hashed_password) VALUES (?, ?, ?, ?)",
                ("user-1", "tester", "tester@example.com", "hashed"),
            )
            await db.execute(
                "INSERT INTO reading_history (document_id, current_paragraph, total_paragraphs) VALUES (?, ?, ?)",
                (document_id, 2, 8),
            )
            await db.execute(
                "INSERT INTO favorite_folders (id, name) VALUES (?, ?)",
                ("folder-1", "默认收藏夹"),
            )
            await db.execute(
                "INSERT INTO favorites (document_id, folder_id) VALUES (?, ?)",
                (document_id, "folder-1"),
            )
            await db.execute(
                "INSERT INTO wordbook_entries (word, meaning, allusion, citations_json) VALUES (?, ?, ?, ?)",
                ("仁", "爱人", "克己复礼", "[]"),
            )
            await db.execute(
                "INSERT INTO document_notes (document_id, note_text) VALUES (?, ?)",
                (document_id, "这是旧笔记"),
            )
            await db.execute(
                """
                INSERT INTO study_sessions (document_id, completed_cards, total_cards, mastered_cards, review_again_cards)
                VALUES (?, ?, ?, ?, ?)
                """,
                (document_id, 3, 5, 2, 1),
            )
            await db.commit()

        await init_database(test_db)
        await init_database(test_db)

        async with get_db(test_db) as db:
            cursor = await db.execute("SELECT COUNT(*) FROM user_reading_history WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute("SELECT COUNT(*) FROM user_favorite_folders WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute("SELECT COUNT(*) FROM user_favorites WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute("SELECT COUNT(*) FROM user_wordbook_entries WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute("SELECT COUNT(*) FROM user_document_notes WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

            cursor = await db.execute("SELECT COUNT(*) FROM user_study_sessions WHERE user_id = ?", ("user-1",))
            assert (await cursor.fetchone())[0] == 1

        os.remove(test_db)


class TestChatRequestModel:
    """测试3: ChatRequest模型验证必填字段（message非空）"""

    def test_valid_request(self):
        req = ChatRequest(message="什么是斗拱？")
        assert req.message == "什么是斗拱？"

    def test_empty_message_fails(self):
        with pytest.raises(Exception):  # Pydantic ValidationError
            ChatRequest(message="")

    def test_missing_message_fails(self):
        with pytest.raises(Exception):
            ChatRequest()


class TestChatResponseModel:
    """测试4: ChatResponse模型包含answer和citations字段"""

    def test_valid_response(self):
        citations = [
            Citation(title="《营造法式》", source="卷三"),
            Citation(title="《天工开物》", source="第五章")
        ]
        resp = ChatResponse(answer="斗拱是中国古建筑的重要构件", citations=citations)
        assert resp.answer == "斗拱是中国古建筑的重要构件"
        assert len(resp.citations) == 2
        assert resp.citations[0].title == "《营造法式》"

    def test_empty_citations_allowed(self):
        resp = ChatResponse(answer="回答内容", citations=[])
        assert resp.citations == []

    def test_citation_structure(self):
        citation = Citation(title="《营造法式》", source="卷三")
        assert citation.title == "《营造法式》"
        assert citation.source == "卷三"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
