# -*- coding: utf-8 -*-
"""
SQLite异步数据库管理模块
提供异步连接管理和表初始化功能
"""
import aiosqlite
from contextlib import asynccontextmanager
from typing import AsyncGenerator


async def init_database(db_path: str = "ancient_texts.db") -> None:
    """
    初始化SQLite数据库，创建必要的表结构

    Args:
        db_path: 数据库文件路径
    """
    async with aiosqlite.connect(db_path) as db:
        # 创建documents表 - 存储古籍文档
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 创建conversations表 - 存储对话历史
        await db.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_message TEXT NOT NULL,
                ai_response TEXT NOT NULL,
                citations_json TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.commit()


@asynccontextmanager
async def get_db(db_path: str = "ancient_texts.db") -> AsyncGenerator[aiosqlite.Connection, None]:
    """
    异步数据库连接上下文管理器

    Args:
        db_path: 数据库文件路径

    Yields:
        aiosqlite.Connection: 数据库连接对象

    Example:
        async with get_db() as db:
            cursor = await db.execute("SELECT * FROM documents")
            rows = await cursor.fetchall()
    """
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row  # 启用字典式访问
        yield db
