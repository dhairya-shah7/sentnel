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

For a fully local / offline start on Windows, run:
```powershell
.\offline-start.ps1
```
That launches the backend, ML service, and frontend in separate PowerShell windows using local ports only.
If MongoDB is not already running on `localhost:27017`, start it first.
If you prefer a double-clickable launcher, use `offline-start.cmd`.

For Kaggle imports that sync into the UI, set `SYNC_LOCAL_TOKEN` in `.env` and pass the same token to the downloader:
```bash
cd ml_service
python download_kaggle_dataset.py --dataset hassan06/nslkdd --sync-token change_me_internal_sync_token
```
The backend rejects sync requests without that token.
If you want to generate a fresh token locally, run:
```powershell
.\generate-sync-token.ps1
```
or double-click `generate-sync-token.cmd`.

To download Kaggle-hosted datasets like NSL-KDD, install the ML dependencies and run:
```bash
cd ml_service
python download_kaggle_dataset.py --dataset hassan06/nslkdd
```
Raw Kaggle files will be copied into `datasets/raw/<dataset_slug>/` and normalized CSVs will be written to `datasets/canonical/<dataset_slug>/`.
You can optionally pass `--output <dir>` to change the repo-relative destination folder.
The importer also copies the merged canonical CSV into `server/uploads/` and calls the local backend sync endpoint so the dataset appears in the UI automatically during development.

If your frontend runs on a different local port, set `CLIENT_URL` or `CLIENT_URLS` in `.env` to include that origin. The backend now accepts any local `localhost` or `127.0.0.1` origin during development, including Vite ports like `5174`.

If `/api/auth/login` starts returning `429`, it usually means the auth limiter has been hit by repeated login attempts or refresh traffic. Restarting the server resets the in-memory limiter, and development mode now allows a much higher threshold.

Upload limits can now be set in gigabytes with `MAX_UPLOAD_SIZE_GB` in `.env`. The backend still accepts `MAX_UPLOAD_SIZE_MB` as a fallback for existing setups.

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

## Deploying On Render / Railway

For production, deploy the backend and frontend as separate services and set these environment variables:

Backend:
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_URL` or `CLIENT_URLS`
- `ML_SERVICE_URL` if you run the ML service separately
- `COOKIE_SAME_SITE=none`
- `COOKIE_SECURE=true`

Frontend:
- `VITE_API_BASE_URL` pointing to the backend origin, for example `https://your-backend.onrender.com`
- `VITE_ML_SERVICE_URL` if you expose the ML service separately

If you deploy the frontend behind a proxy or custom domain, the app will use that origin automatically when `VITE_API_BASE_URL` is not set. For a separate frontend/backend deployment, always set `VITE_API_BASE_URL` explicitly.

## Desktop Installer

The repo now includes an Electron packaging path for a local desktop app installer.

Build the installer on Windows:
```bash
npm install
npm run desktop:dist
```

The installer output is written to `release/`.

The desktop shell loads the built frontend from `client/dist/` and reads backend URLs from:
- `SENTINELOPS_API_BASE_URL`
- `SENTINELOPS_ML_SERVICE_URL`

If those are not set, it defaults to local service ports so you can point the app at a backend running on the same machine.

The installer packages the desktop shell, not MongoDB or the Python ML runtime. For full analysis and dataset flows on a local device, run the backend and ML service on that same machine or point the installer at a hosted backend.

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

## Offline Mode

### True Offline Operation

The app supports **true offline** - data works without internet by using local caching:

1. **Run locally:** Start all services with `.\offline-start.ps1`
2. **Data cached:** Dashboard, anomalies, datasets cached in IndexedDB
3. **Offline indicator:** Shows when connection is lost
4. **Auto-sync:** Queued operations sync when back online

### Starting in Offline Mode (Windows)

```powershell
.\offline-start.ps1
```

This opens three PowerShell windows:
- Backend server (port 4000)
- ML Service (port 8000)
- Frontend (port 5173)

**Prerequisite:** Ensure MongoDB is running on `localhost:27017`.

### PWA Offline Support

1. **Install as App:** Click "Install" or use browser's "Add to Home Screen"
2. **Offline Assets:** Static assets cached for offline access
3. **Offline Indicator:** Shows connection status in top bar
4. **Pending Sync:** Queues operations for automatic sync when reconnected

### Offline Capabilities

| Feature | Online | Offline |
|---------|--------|---------|
| View Dashboard | ✅ Full data | ✅ Cached data |
| View Anomalies | ✅ Full data | ✅ Cached data |
| Flag Anomalies | ✅ Immediate | ✅ Queued, synced later |
| Upload Dataset | ✅ Full | ❌ Blocked |
| Run Analysis | ✅ Full | ❌ Blocked |
| Real-time Alerts | ✅ Full | ❌ Requires backend |

### Network Mode (Cloud)

To use with internet/cloud backend:
1. Update `.env` with your server URL
2. Remove `OFFLINE_MODE` env variable
3. The app will work with remote backend normally

## Browser Notifications

The app can send real-time browser notifications for new anomalies:

1. Go to **Settings** → **Browser Notifications**
2. Click **Enable Browser Notifications**
3. Allow browser permission when prompted

Configure:
- **Notifications** - Enable/disable all notifications
- **Sound** - Play alert sound on new anomalies
- **Critical Only** - Only notify on critical threats
- **Alert Threshold** - Minimum risk score to trigger notification
