# AI Video Tracking - Dashboard + API

FastAPI backend and React + Vite frontend for ROI-based CCTV surveillance analytics.

For a detailed walkthrough of the system flow, see the [End-to-End Pipeline Documentation](docs/PIPELINE.md).

## Project Structure

```
tracking/
├── backend/            # FastAPI Backend
│   ├── api/            # API routes, services, db
│   ├── config/         # Paths, YOLO settings, CORS origins
│   ├── core/           # VideoProcessor (YOLO + ByteTrack + ROI analytics)
│   ├── data/           # Database, uploads, and output artifacts
│   ├── models/         # YOLO model weights
│   ├── scripts/        # Utility scripts
│   ├── main.py         # CLI entry point
│   └── requirements.txt
└── frontend/           # React + Vite Frontend
```

## Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.app:app --reload
```

API docs: http://localhost:8000/docs

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload video (`video_file` multipart) → `{ job_id }` |
| POST | `/api/process/{job_id}` | Start processing with ROI polygons |
| GET | `/api/status/{job_id}` | Job status and progress |
| GET | `/api/results/{job_id}` | Result URLs and analytics events |
| GET | `/api/downloads/raw/{job_id}` | Stream uploaded source video |
| GET | `/api/downloads/video/{job_id}` | Download processed MP4 |
| GET | `/api/downloads/video/stream/{job_id}` | Stream processed MP4 |
| GET | `/api/downloads/csv/{job_id}` | Download analytics CSV |
| GET | `/api/downloads/snapshot/{job_id}/{filename}` | Event snapshot image |
| GET | `/api/jobs/{job_id}/frame?frame_num=N` | Single frame JPEG |

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Runs at http://localhost:3000 (proxies API calls to http://localhost:8000).

## Storage layout

All runtime files live under `backend/data/`:

```
backend/data/
  surveillance.db       # jobs, ROIs, analytics events
  uploads/              # input videos (per job: uploads/{job_id}/video.mp4)
  output/               # processed videos, CSVs, snapshots (per job)
```

## CLI processing (no API)

```bash
cd backend
python main.py
```

Uses `data/uploads/cctv1.mp4` by default and writes results under `data/output/{job_id}/`.
