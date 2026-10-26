import os
import uuid
import traceback
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

import config.settings as settings
from core.processor import VideoProcessor
from . import db

UPLOAD_DIR = settings.UPLOAD_DIR
OUTPUT_DIR = settings.OUTPUT_DIR

executor = ThreadPoolExecutor(max_workers=2)


def _safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "").strip()
    return name if name else "upload.mp4"


def create_job(filename: str, file_content: bytes) -> str:
    job_id = uuid.uuid4().hex
    safe_name = _safe_filename(filename)
    job_upload_dir = os.path.join(UPLOAD_DIR, job_id)
    job_output_dir = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_upload_dir, exist_ok=True)
    os.makedirs(job_output_dir, exist_ok=True)

    saved_path = os.path.join(job_upload_dir, safe_name)
    with open(saved_path, "wb") as f:
        f.write(file_content)

    import cv2
    cap = cv2.VideoCapture(saved_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    db.create_job(job_id, safe_name, saved_path)
    db.update_job_metadata(job_id, fps, width, height, total_frames)

    return job_id


def _run_processing(job_id: str):
    job = db.get_job(job_id)
    if not job:
        print(f"DEBUG: Job {job_id} not found in DB.")
        return

    try:
        print(f"DEBUG: Starting processing for job {job_id}...")
        input_path = job["input_path"]
        rois = db.get_rois(job_id)

        output_video = os.path.join(OUTPUT_DIR, job_id, f"{job_id}.mp4")
        output_csv = os.path.join(OUTPUT_DIR, job_id, f"{job_id}.csv")
        snapshots_dir = os.path.join(OUTPUT_DIR, job_id, "snapshots")
        os.makedirs(snapshots_dir, exist_ok=True)

        settings.INPUT_VIDEO_PATH = input_path
        settings.OUTPUT_VIDEO_PATH = output_video
        settings.OUTPUT_CSV_PATH = output_csv

        vp = VideoProcessor(
            job_id=job_id,
            input_path=input_path,
            output_path=output_video,
            csv_path=output_csv,
            zones=rois,
        )
        print("DEBUG: Calling vp.process_video()...")
        vp.process_video()
        print("DEBUG: vp.process_video() returned.")

        if not os.path.exists(output_video):
            print(f"DEBUG: ERROR - Output video not found at {output_video}")
            raise RuntimeError("Processed video not found after processing")

        print(f"DEBUG: Updating job status to completed for {job_id}...")
        db.update_job_status(job_id, "completed", video_path=output_video, csv_path=output_csv)
        print(f"DEBUG: Job {job_id} successfully marked as completed.")
    except Exception as e:
        print(f"DEBUG: Exception in _run_processing: {str(e)}")
        traceback.print_exc()
        db.update_job_status(job_id, "failed", error=traceback.format_exc())


def start_processing(job_id: str, rois: List[Dict[str, Any]], force: bool = False) -> None:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # If already processing, don't start another
    if job["status"] == "processing":
        return
    # If completed and not forcing, do nothing
    if job["status"] == "completed" and not force:
        return

    # If forcing a reprocess, clear previous analytics so results are refreshed
    if force:
        db.replace_job_analytics(job_id, [])

    db.save_rois(job_id, rois)
    db.update_job_status(job_id, "processing")
    executor.submit(_run_processing, job_id)


def get_status(job_id: str) -> Dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


def get_results(job_id: str) -> Dict[str, Any]:
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job not completed")

    events = db.ensure_job_analytics(job_id, job.get("csv_path"))

    # Normalize events and keep snapshot_path; snapshot_url will be constructed by route layer
    normalized_events = []
    for ev in (events or []):
        ev_copy = dict(ev)
        normalized_events.append(ev_copy)

    # Return both filesystem paths and canonical API URLs (stream + download)
    video_path = job.get("video_path")
    csv_path = job.get("csv_path")

    # Provide URLs relative to API; route layer builds absolute URLs when serving HTTP
    video_stream_url = f"/api/downloads/video/stream/{job_id}"
    video_download_url = f"/api/downloads/video/{job_id}"
    csv_url = f"/api/downloads/csv/{job_id}"

    return {
        "video_path": video_path,
        "csv_path": csv_path,
        "video_url": video_stream_url,
        "download_url": video_download_url,
        "csv_url": csv_url,
        "events": normalized_events,
    }
