FROM python:3.11-slim

WORKDIR /app

# Railway currently builds this image from the repository root even when
# dockerfilePath points at this file, so source paths must stay repo-root based.
COPY src/backend-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source + data files
COPY src/backend-gateway/ .

# Rebuild FAISS index during image build so runtime and index metadata both use fastembed.
RUN python scripts/rebuild_ancient_index.py --backend fastembed --strict

# Make start script executable
RUN chmod +x start.sh

# Railway sets PORT dynamically, expose it
EXPOSE 8000
CMD ["bash", "start.sh"]
