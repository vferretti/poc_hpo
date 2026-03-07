FROM node:18-slim AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build
# Vite outputs to ../static/dist relative to /build, i.e. /static/dist

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY static/ static/
COPY --from=frontend-builder /static/dist static/dist
COPY hp.json .

ENV HP_JSON_PATH=/app/hp.json

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
