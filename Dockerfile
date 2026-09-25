# Stage 1: build the React frontend into frontend/dist
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI backend serving the built frontend
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY backend/ backend/
COPY schemas/ schemas/
COPY simulator/ simulator/
COPY gateway/ gateway/
COPY --from=frontend /app/frontend/dist frontend/dist
EXPOSE 8000
# One worker only: SQLite has a single writer process.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
