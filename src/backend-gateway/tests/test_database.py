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

        # 清理
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
