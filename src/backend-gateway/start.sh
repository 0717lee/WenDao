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
echo "Starting uvicorn on port $ACTUAL_PORT..."

exec uvicorn main:app --host 0.0.0.0 --port $ACTUAL_PORT --log-level info
