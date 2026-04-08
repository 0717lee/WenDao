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
# 默认不在启动时做全量 re-import，避免新实例在 boot 阶段被全文语料打爆。
# 如需显式执行，可在 Railway 里设置 RUN_CORPUS_REIMPORT_ON_BOOT=1。
if [ "${RUN_CORPUS_REIMPORT_ON_BOOT:-0}" = "1" ]; then
  echo "Running cloud-side corpus re-import..."
  export PYTHONPATH=$PYTHONPATH:$(pwd)
  python scripts/reimport_corpus.py || echo "Warning: Re-import script failed, continuing anyway..."
else
  echo "Skipping cloud-side corpus re-import on boot (set RUN_CORPUS_REIMPORT_ON_BOOT=1 to enable)."
fi

exec uvicorn main:app --host 0.0.0.0 --port $ACTUAL_PORT --log-level info
