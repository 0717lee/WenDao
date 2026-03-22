FROM python:3.11-slim

WORKDIR /app

# Install dependencies (PaddleOCR excluded — lazy fallback, too heavy for cloud deploy)
COPY src/backend-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source + data files
COPY src/backend-gateway/ .

# Make start script executable
RUN chmod +x start.sh

# Railway sets PORT dynamically, expose it
EXPOSE 8000
CMD ["bash", "start.sh"]
