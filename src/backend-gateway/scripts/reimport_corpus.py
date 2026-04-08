#!/usr/bin/env python
# -*- coding: utf-8 -*-
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv

from core.pg_database import pg_lifespan, init_pg_database
from core.database import init_database

async def main():
    print("加载环境变量...")
    load_dotenv()
    
    if os.getenv("DATABASE_URL"):
        seed_mode = os.getenv("PG_CORPUS_SEED_MODE", "full")
        print(f"发现 DATABASE_URL，连接 PostgreSQL 数据库并初始化/更新数据... 当前模式: {seed_mode}")
        async with pg_lifespan():
            await init_pg_database(seed_mode=seed_mode)
    else:
        print("未发现 DATABASE_URL，连接默认的 SQLite 数据库 ancient_texts.db 并初始化/更新数据...")
        await init_database()
        
    print("更新完成！所有的语料库文档已经根据 kanripo_corpus.json 重新导入/更新。")

if __name__ == "__main__":
    asyncio.run(main())
