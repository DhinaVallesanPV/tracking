import os
import re
import traceback
import logging
import cv2
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from config import settings
from . import schemas
from . import services
from . import db

logger = logging.getLogger("api.routes")
router = APIRouter(prefix="/api")

def range_aware_stream(video_path: str, request: Request) -> Response:
    file_size = os.path.getsize(video_path)
    range_header = request.headers.get("range")
    if range_header:
        m = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not m:
            raise HTTPException(status_code=416, detail="Invalid range")
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else file_size - 1
        if end >= file_size:
            end = file_size - 1
        length = end - start + 1
        with open(video_path, "rb") as f:
            f.seek(start)
            chunk = f.read(length)
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
        }
        return Response(content=chunk, status_code=206, media_type="video/mp4", headers=headers)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
    }
    def iterfile(path, chunk_size=32 * 1024):
        with open(path, "rb") as f:
            while True:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(iterfile(video_path), media_type="video/mp4", headers=headers)

@router.post("/upload", response_model=schemas.UploadResponse)
async def upload_video(video_file: UploadFile = File(...)):
    if not video_file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    ext = os.path.splitext(video_file.filename)[1].lower()
    if ext not in [".mp4", ".avi", ".mov"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    content = await video_file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    job_id = services.create_job(video_file.filename, content)
    return {"job_id": job_id}

@router.get("/downloads/raw/{job_id}")
async def download_raw_video(job_id: str, request: Request):
    job = services.get_status(job_id)
    video_path = job.get("input_path")
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Raw video not found")
    return range_aware_stream(video_path, request)

@router.get("/jobs/{job_id}/frame")
async def get_frame(job_id: str, frame_num: int = 0):
    job = services.get_status(job_id)
    video_path = job.get("input_path")
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")

    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
    ret, frame = cap.read()
    cap.release()

    if not ret:
        raise HTTPException(status_code=404, detail="Frame not found")

    _, buffer = cv2.imencode('.jpg', frame)
    return Response(content=buffer.tobytes(), media_type="image/jpeg")

@router.post("/process/{job_id}", response_model=schemas.ProcessResponse)
async def process_job(job_id: str, request_data: schemas.ProcessRequest, force: bool = False):
    rois = [roi.dict() for roi in request_data.rois]
    services.start_processing(job_id, rois, force=force)
    return {"status": "processing"}

@router.get("/status/{job_id}", response_model=schemas.StatusResponse)
async def get_status(job_id: str):
    status = services.get_status(job_id)
    return {
        "status": status["status"],
        "detail": status.get("error"),
        "progress": status.get("progress", 0.0),
        "current_frame": status.get("current_frame", 0),
        "total_frames": status.get("total_frames", 0)
    }

@router.get("/results/{job_id}", name="get_job_results")
async def get_results(job_id: str, request: Request):
    try:
        res = services.get_results(job_id)
    except HTTPException:
        raise
    except Exception:
        tb = traceback.format_exc()
        logger.error("Error in get_results: %s", tb)
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    # Prefer streaming/download URLs that point to the router endpoints if the files exist.
    job = db.get_job(job_id)
    video_exists = False
    csv_exists = False
    if job:
        video_exists = bool(job.get("video_path") and os.path.exists(job.get("video_path")))
        csv_exists = bool(job.get("csv_path") and os.path.exists(job.get("csv_path")))

    # Append ngrok bypass param to URLs
    bypass_param = "?ngrok-skip-browser-warning=1"
    video_stream_url = str(request.url_for("stream_video", job_id=job_id)) + bypass_param if video_exists else None
    video_download_url = str(request.url_for("download_video", job_id=job_id)) + bypass_param if video_exists else None
    csv_url = str(request.url_for("download_csv", job_id=job_id)) + bypass_param if csv_exists else None

    events = []
    for ev in res.get("events", []):
        ev_dict = dict(ev)
        snapshot_path = ev_dict.get("snapshot_path")
        if not snapshot_path:
            snapshot_path = db.snapshot_path_for_event(
                job_id, ev_dict.get("tracker_id", 0), ev_dict.get("roi_name", "")
            )
        if snapshot_path:
            snapshot_filename = os.path.basename(snapshot_path)
            ev_dict["snapshot_url"] = str(
                request.url_for("download_snapshot", job_id=job_id, filename=snapshot_filename)
            ) + bypass_param
        else:
            ev_dict["snapshot_url"] = None
        events.append(ev_dict)

    return JSONResponse(status_code=200, content={
        "video_url": video_stream_url,
        "download_url": video_download_url,
        "csv_url": csv_url,
        "events": events,
    })

@router.get("/downloads/video/{job_id}", name="download_video")
async def download_video(job_id: str):
    res = services.get_results(job_id)
    video_path = res.get("video_path")
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")
    resp = FileResponse(video_path, media_type="video/mp4")
    resp.headers["Accept-Ranges"] = "bytes"
    return resp

@router.get("/downloads/csv/{job_id}", name="download_csv")
async def download_csv(job_id: str):
    res = services.get_results(job_id)
    csv_path = res.get("csv_path")
    if not csv_path or not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="CSV not found")
    return FileResponse(csv_path, media_type="text/csv", filename=os.path.basename(csv_path))

@router.get("/downloads/snapshot/{job_id}/{filename}", name="download_snapshot")
async def download_snapshot(job_id: str, filename: str):
    safe_name = os.path.basename(filename)
    if not safe_name or safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    snapshot_path = os.path.join(settings.OUTPUT_DIR, job_id, "snapshots", safe_name)
    if not os.path.exists(snapshot_path):
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return FileResponse(snapshot_path, media_type="image/jpeg")

@router.get("/downloads/video/stream/{job_id}", name="stream_video")
async def stream_video(job_id: str, request: Request):
    res = services.get_results(job_id)
    video_path = res.get("video_path")
    if not video_path or not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")
    return range_aware_stream(video_path, request)
