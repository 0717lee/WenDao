FROM python:3.11-slim

WORKDIR /app

# Install dependencies (PaddleOCR excluded — lazy fallback, too heavy for cloud deploy)
COPY src/backend-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source + data files
COPY src/backend-gateway/ .

# Railway sets PORT dynamically, expose it
EXPOSE 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info
