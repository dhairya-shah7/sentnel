# SentinelOps - Defence-Grade Communication Anomaly Detection

SentinelOps is a full-stack app for monitoring communication metadata, detecting anomalies, and flagging suspicious activity without exposing message content.

## Architecture

```
Frontend  (React + Vite)       :5173
Backend   (Node.js + Express)  :4000
ML Service (Python + FastAPI)  :8000
Database  (MongoDB)            :27017
```

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20+ | `node -v` |
| npm | 9+ | `npm -v` |
| Python | 3.10 - 3.13 | `python --version` |
| pip | latest | `pip --version` |
| MongoDB | 6+ | Running via MongoDB Compass |

## Quick Start

### 1. Clone and configure
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secrets
```

### 2. Start MongoDB
Open MongoDB Compass and connect to `mongodb://localhost:27017`.
The `sentinelops` database will be created automatically.

### 3. Start ML Service
```bash
cd ml_service
python -m venv venv
# Windows:
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for Swagger UI.

If you are using Python 3.13 on Windows, keep the pinned ML dependencies from `ml_service/requirements.txt`; older `scikit-learn`, `numpy`, or `pandas` versions may try to build from source and fail during install.

If your frontend runs on a different local port, set `CLIENT_URL` or `CLIENT_URLS` in `.env` to include that origin. The backend now accepts any local `localhost` or `127.0.0.1` origin during development, including Vite ports like `5174`.

If `/api/auth/login` starts returning `429`, it usually means the auth limiter has been hit by repeated login attempts or refresh traffic. Restarting the server resets the in-memory limiter, and development mode now allows a much higher threshold.

### 4. Start Backend Server
```bash
cd server
npm install
npm run dev
```

API available at `http://localhost:4000/api`.

### 5. Start Frontend
```bash
cd client
npm install
npm run dev
```

App available at `http://localhost:5173`.

## Default Admin Account

Create an account via the Register page on first run. The first registered user automatically gets the `admin` role.

## API Reference

### Auth
```txt
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/refresh
```

### Datasets
```txt
POST   /api/dataset/upload
GET    /api/dataset
GET    /api/dataset/:id
DELETE /api/dataset/:id
```

### Analysis
```txt
POST /api/analysis/run/:datasetId
GET  /api/analysis/:jobId/status
GET  /api/analysis/:jobId/results
```

### Anomalies
```txt
GET   /api/anomalies
GET   /api/anomalies/:id
PATCH /api/anomalies/:id/flag
GET   /api/anomalies/export
```

### Dashboard
```txt
GET /api/dashboard/stats
```

### Audit
```txt
GET /api/audit/logs
```

## ML Service API
```txt
POST /ml/train
POST /ml/predict
GET  /ml/model/status
POST /ml/retrain
GET  /ml/export
```

## WebSocket Events

Server to Client:
```txt
analysis:progress
analysis:complete
anomaly:new
system:alert
```

Client to Server:
```txt
subscribe:job
subscribe:dashboard
```
