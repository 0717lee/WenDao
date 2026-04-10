FROM python:3.11-slim

WORKDIR /app

ARG REBUILD_FAISS_ON_BUILD=0
ARG REBUILD_FAISS_BACKEND=fastembed
ARG REBUILD_FAISS_STRICT=0

# Railway currently builds this image from the repository root even when
# dockerfilePath points at this file, so source paths must stay repo-root based.
COPY src/backend-gateway/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source + data files
COPY src/backend-gateway/ .

# Default to the checked-in index artifacts during image build.
# This avoids transient remote model-download failures (for example Hugging Face 429s)
# from breaking the entire deployment. Rebuild only when explicitly requested.
RUN if [ "$REBUILD_FAISS_ON_BUILD" = "1" ]; then \
      if [ "$REBUILD_FAISS_STRICT" = "1" ]; then \
        python scripts/rebuild_corpus_faiss.py --backend "$REBUILD_FAISS_BACKEND" --strict; \
      else \
        python scripts/rebuild_corpus_faiss.py --backend "$REBUILD_FAISS_BACKEND"; \
      fi; \
    else \
      echo "Skipping FAISS rebuild during image build; using repository index artifacts."; \
    fi

# Make start script executable
RUN chmod +x start.sh

# Railway sets PORT dynamically, expose it
EXPOSE 8000
CMD ["bash", "start.sh"]
