#!/bin/bash
set -e

echo "=== Railway Deployment Debug Info ==="
echo "PORT environment variable: ${PORT:-NOT_SET}"
echo "Current directory: $(pwd)"
echo "Python version: $(python --version)"
echo "Installed packages:"
pip list | grep -E "(fastapi|uvicorn|aiosqlite|faiss)"
echo "====================================="

# Use PORT from environment, fallback to 8000
ACTUAL_PORT=${PORT:-8000}
# 🚀 第一次部署或更新后，自动刷新云端古籍数据（一劳永逸解决本地公网写入超时的痛点）
echo "Running cloud-side corpus re-import..."
export PYTHONPATH=$PYTHONPATH:$(pwd)
python scripts/reimport_corpus.py || echo "Warning: Re-import script failed, continuing anyway..."

exec uvicorn main:app --host 0.0.0.0 --port $ACTUAL_PORT --log-level info
