import os
import shutil
import sqlite3
import json
from typing import Dict, Any, List, Optional

from config import settings

DATA_DIR = settings.DATA_DIR
DB_PATH = settings.DB_PATH

def get_connection():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn



def _migrate_snapshot_path():
    """Add snapshot_path column if it was created before this column existed."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT snapshot_path FROM analytics_events LIMIT 1")
    except sqlite3.OperationalError:
        try:
            cursor.execute("ALTER TABLE analytics_events ADD COLUMN snapshot_path TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Already added by another thread
    conn.close()

def _rewrite_storage_path(path: Optional[str], replacements: List[tuple]) -> Optional[str]:
    if not path:
        return path
    norm = os.path.normpath(path)
    for old_root, new_root in replacements:
        old_norm = os.path.normpath(old_root)
        try:
            if os.path.commonpath([norm, old_norm]) == old_norm:
                suffix = os.path.relpath(norm, old_norm)
                if suffix == ".":
                    return new_root
                return os.path.normpath(os.path.join(new_root, suffix))
        except ValueError:
            continue
    return path

def _migrate_storage_layout():
    """Move legacy root uploads/outputs and data/input into data/uploads & data/output."""
    base = settings.BASE_DIR
    legacy_upload = os.path.join(base, "uploads")
    legacy_output = os.path.join(base, "outputs")
    legacy_input = os.path.join(DATA_DIR, "input")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)

    def move_children(src_root: str, dst_root: str):
        if not os.path.isdir(src_root):
            return
        for name in os.listdir(src_root):
            src = os.path.join(src_root, name)
            dst = os.path.join(dst_root, name)
            if os.path.exists(dst):
                continue
            shutil.move(src, dst)
        try:
            os.rmdir(src_root)
        except OSError:
            pass

    move_children(legacy_upload, settings.UPLOAD_DIR)
    move_children(legacy_output, settings.OUTPUT_DIR)

    if os.path.isdir(legacy_input):
        for name in os.listdir(legacy_input):
            src = os.path.join(legacy_input, name)
            if not os.path.isfile(src):
                continue
            dst = os.path.join(settings.UPLOAD_DIR, name)
            if not os.path.exists(dst):
                shutil.move(src, dst)
        try:
            os.rmdir(legacy_input)
        except OSError:
            pass

    replacements = [
        (legacy_upload, settings.UPLOAD_DIR),
        (legacy_output, settings.OUTPUT_DIR),
        (legacy_input, settings.UPLOAD_DIR),
    ]

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, input_path, video_path, csv_path FROM jobs")
    for job_id, input_path, video_path, csv_path in cursor.fetchall():
        new_input = _rewrite_storage_path(input_path, replacements)
        new_video = _rewrite_storage_path(video_path, replacements)
        new_csv = _rewrite_storage_path(csv_path, replacements)
        if (new_input, new_video, new_csv) != (input_path, video_path, csv_path):
            cursor.execute(
                "UPDATE jobs SET input_path = ?, video_path = ?, csv_path = ? WHERE id = ?",
                (new_input, new_video, new_csv, job_id),
            )

    cursor.execute("SELECT id, snapshot_path FROM analytics_events WHERE snapshot_path IS NOT NULL")
    for event_id, snapshot_path in cursor.fetchall():
        new_snapshot = _rewrite_storage_path(snapshot_path, replacements)
        if new_snapshot != snapshot_path:
            cursor.execute(
                "UPDATE analytics_events SET snapshot_path = ? WHERE id = ?",
                (new_snapshot, event_id),
            )

    conn.commit()
    conn.close()

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Jobs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        input_path TEXT NOT NULL,
        video_path TEXT,
        csv_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        progress REAL DEFAULT 0.0,
        current_frame INTEGER DEFAULT 0,
        total_frames INTEGER DEFAULT 0,
        fps REAL,
        width INTEGER,
        height INTEGER
    )
    """)

    # ROIs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rois (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        polygon TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
    """)

    # Analytics Events Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        tracker_id INTEGER NOT NULL,
        object_type TEXT NOT NULL,
        roi_id TEXT NOT NULL,
        roi_name TEXT NOT NULL,
        entry_time TEXT NOT NULL,
        exit_time TEXT,
        stay_duration TEXT,
        frame_count INTEGER DEFAULT 0,
        snapshot_path TEXT,
        FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        FOREIGN KEY(roi_id) REFERENCES rois(id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    conn.close()

    # Migration: ensure snapshot_path column exists on pre-existing databases
    _migrate_snapshot_path()
    _migrate_storage_layout()

# Initialize database immediately
init_db()

def create_job(job_id: str, filename: str, input_path: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO jobs (id, filename, status, input_path) VALUES (?, ?, ?, ?)",
        (job_id, filename, "pending", input_path)
    )
    conn.commit()
    conn.close()

def update_job_status(job_id: str, status: str, error: Optional[str] = None, video_path: Optional[str] = None, csv_path: Optional[str] = None):
    conn = get_connection()
    cursor = conn.cursor()
    if error:
        cursor.execute(
            "UPDATE jobs SET status = ?, error = ? WHERE id = ?",
            (status, error, job_id)
        )
    elif video_path or csv_path:
        cursor.execute(
            "UPDATE jobs SET status = ?, video_path = COALESCE(?, video_path), csv_path = COALESCE(?, csv_path) WHERE id = ?",
            (status, video_path, csv_path, job_id)
        )
    else:
        cursor.execute(
            "UPDATE jobs SET status = ? WHERE id = ?",
            (status, job_id)
        )
    conn.commit()
    conn.close()

def update_job_progress(job_id: str, progress: float, current_frame: int, total_frames: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE jobs SET progress = ?, current_frame = ?, total_frames = ? WHERE id = ?",
        (progress, current_frame, total_frames, job_id)
    )
    conn.commit()
    conn.close()

def update_job_metadata(job_id: str, fps: float, width: int, height: int, total_frames: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE jobs SET fps = ?, width = ?, height = ?, total_frames = ? WHERE id = ?",
        (fps, width, height, total_frames, job_id)
    )
    conn.commit()
    conn.close()

def update_job_input_path(job_id: str, input_path: str, status: str = "pending"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE jobs SET input_path = ?, status = ?, error = NULL WHERE id = ?",
        (input_path, status, job_id)
    )
    conn.commit()
    conn.close()

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def get_all_jobs() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_rois(job_id: str, rois: List[Dict[str, Any]]):
    conn = get_connection()
    cursor = conn.cursor()
    # First, delete any existing ROIs for this job
    cursor.execute("DELETE FROM rois WHERE job_id = ?", (job_id,))
    
    for roi in rois:
        roi_id = roi.get("id")
        name = roi.get("name")
        polygon_json = json.dumps(roi.get("polygon"))
        cursor.execute(
            "INSERT INTO rois (id, job_id, name, polygon) VALUES (?, ?, ?, ?)",
            (roi_id, job_id, name, polygon_json)
        )
    conn.commit()
    conn.close()

def get_rois(job_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rois WHERE job_id = ?", (job_id,))
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        d = dict(r)
        d["polygon"] = json.loads(d["polygon"])
        result.append(d)
    return result

def save_analytics_event(
    event_id: str,
    job_id: str,
    tracker_id: int,
    object_type: str,
    roi_id: str,
    roi_name: str,
    entry_time: str,
    snapshot_path: Optional[str] = None,
):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR REPLACE INTO analytics_events 
        (id, job_id, tracker_id, object_type, roi_id, roi_name, entry_time, snapshot_path) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (event_id, job_id, tracker_id, object_type, roi_id, roi_name, entry_time, snapshot_path),
    )
    conn.commit()
    conn.close()

def update_analytics_event_exit(
    job_id: str,
    tracker_id: int,
    roi_name: str,
    exit_time: str,
    stay_duration: str,
    frame_count: int
):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE analytics_events 
        SET exit_time = ?, stay_duration = ?, frame_count = ? 
        WHERE job_id = ? AND tracker_id = ? AND roi_name = ?
        """,
        (exit_time, stay_duration, frame_count, job_id, tracker_id, roi_name)
    )
    conn.commit()
    conn.close()

def replace_job_analytics(job_id: str, events: List[Dict[str, Any]]):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM analytics_events WHERE job_id = ?", (job_id,))
    for ev in events:
        cursor.execute(
            """
            INSERT INTO analytics_events
            (id, job_id, tracker_id, object_type, roi_id, roi_name,
             entry_time, exit_time, stay_duration, frame_count, snapshot_path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ev["id"],
                job_id,
                ev["tracker_id"],
                ev["object_type"],
                ev.get("roi_id", ""),
                ev["roi_name"],
                ev["entry_time"],
                ev.get("exit_time"),
                ev.get("stay_duration"),
                ev.get("frame_count", 0),
                ev.get("snapshot_path"),
            ),
        )
    conn.commit()
    conn.close()

def _safe_zone_name(zone_name: str) -> str:
    return "".join([c if c.isalnum() else "_" for c in zone_name])

def _snapshot_path_for_event(job_id: str, tracker_id: int, roi_name: str) -> Optional[str]:
    path = os.path.join(
        settings.OUTPUT_DIR,
        job_id,
        "snapshots",
        f"{tracker_id}_{_safe_zone_name(roi_name)}.jpg",
    )
    return path if os.path.isfile(path) else None

def snapshot_path_for_event(job_id: str, tracker_id: int, roi_name: str) -> Optional[str]:
    return _snapshot_path_for_event(job_id, tracker_id, roi_name)

def load_analytics_from_csv(job_id: str, csv_path: str) -> List[Dict[str, Any]]:
    import pandas as pd

    if not os.path.isfile(csv_path):
        return []

    df = pd.read_csv(csv_path)
    if df.empty:
        return []

    events = []
    for _, row in df.iterrows():
        object_id = str(row.get("Object ID", ""))
        tracker_id = 0
        if "_" in object_id:
            suffix = object_id.rsplit("_", 1)[-1]
            if suffix.isdigit():
                tracker_id = int(suffix)

        roi_name = str(row.get("ROI", "Zone"))
        safe_zone = _safe_zone_name(roi_name)
        event_id = f"{job_id}_{tracker_id}_{safe_zone}_{len(events)}"
        snapshot_path = _snapshot_path_for_event(job_id, tracker_id, roi_name)

        events.append({
            "id": event_id,
            "job_id": job_id,
            "tracker_id": tracker_id,
            "object_type": str(row.get("Object Type", "Person")),
            "roi_id": safe_zone,
            "roi_name": roi_name,
            "entry_time": str(row.get("Entry Time", "00:00:00")),
            "exit_time": str(row["Exit Time"]) if pd.notna(row.get("Exit Time")) else None,
            "stay_duration": str(row["Stay Duration"]) if pd.notna(row.get("Stay Duration")) else None,
            "frame_count": int(row["Frame Count"]) if pd.notna(row.get("Frame Count")) else 0,
            "snapshot_path": snapshot_path,
        })
    return events

def get_analytics_events(job_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM analytics_events WHERE job_id = ? ORDER BY entry_time", (job_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def ensure_job_analytics(job_id: str, csv_path: Optional[str]) -> List[Dict[str, Any]]:
    """Return analytics events, backfilling from CSV on disk when the DB is empty."""
    events = get_analytics_events(job_id)
    if events:
        return events
    if not csv_path:
        return []
    events = load_analytics_from_csv(job_id, csv_path)
    if events:
        replace_job_analytics(job_id, events)
    return events
