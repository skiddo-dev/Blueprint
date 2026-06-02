# Blueprint — Streamlit Kanban container
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for better layer caching
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code (see .dockerignore — secrets/.env/.venv are excluded)
COPY . .
RUN chmod +x entrypoint.sh

# Streamlit listens here. Tell Azure this port:
#   App Service:  set WEBSITES_PORT=8501
#   Container Apps: set ingress targetPort=8501
EXPOSE 8501

ENTRYPOINT ["sh", "entrypoint.sh"]
