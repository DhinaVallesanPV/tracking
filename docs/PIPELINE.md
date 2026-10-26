  # End-to-End Video Tracking Pipeline

  This document describes the end-to-end pipeline for the AI Video Tracking project, from video upload to result visualization.

  ## Architecture Overview

  The system consists of a **FastAPI backend** and a **React/Vite frontend**. It uses **YOLOv11** for object detection and tracking, and **Supervision** for zone analytics and annotations.

  ---

  ## 1. Video Upload Phase
  - **Action:** User selects a video file (.mp4, .avi, .mov) on the frontend.
  - **Frontend:** Sends a `POST` request to `/api/upload` with the video file.
  - **Backend:** 
    - Validates file type and size.
    - Generates a unique `job_id`.
    - Saves the raw video to `backend/data/uploads/`.
    - Initializes a job entry in the SQLite database.
  - **Response:** Returns the `job_id` to the frontend.

  ## 2. ROI (Region of Interest) Selection
  - **Action:** User views the first frame of the uploaded video and defines one or more zones (polygons).
  - **Frontend:** 
    - Fetches the first frame via `/api/jobs/{job_id}/frame?frame_num=0`.
    - Provides an interactive UI to draw polygons.
    - Sends a `POST` request to `/api/process/{job_id}` with the defined ROI data.
  - **Backend:** Updates the job state and prepares for processing.

  ## 3. Processing Phase (Core Engine)
  - **Action:** The `VideoProcessor` runs the tracking algorithm.
  - **Backend Logic:**
    - Loads the pretrained model from `backend/models/yolo11n.pt`.
    - Uses `ultralytics` tracking with `bytetrack`.
    - **Frame Processing Loop:**
      - Detects objects (Person, Bike, Car, etc.).
      - Updates object tracks across frames.
      - Checks if object anchors (bottom-center) are inside defined ROI polygons.
      - Captures "Snapshots" (crops) of objects when they first enter a zone.
      - Annotates frames with bounding boxes, labels, and zone statistics.
      - Writes the processed frame to an output video using `imageio` (FFmpeg-based).
    - **Analytics:** Calculates entry time, exit time, and stay duration for each object in each zone.
    - **Persistence:** 
      - Saves the annotated video to `backend/data/output/{job_id}/output_result.mp4`.
      - Saves a summary CSV to `backend/data/output/{job_id}/zone_analytics.csv`.
      - Updates the SQLite database with detailed event analytics.

  ## 4. Result Visualization
  - **Action:** User views the processing results on the dashboard.
  - **Frontend:**
    - Polls `/api/status/{job_id}` to show a progress bar.
    - Once complete, fetches result metadata from `/api/results/{job_id}`.
  - **Backend:** Provides:
    - **Video Streaming:** `/api/downloads/video/stream/{job_id}` (Range-aware for seeking).
    - **CSV Download:** `/api/downloads/csv/{job_id}`.
    - **Snapshots:** Served individually for each tracked event.
  - **Visualization:**
    - High-quality annotated video player.
    - Analytics table showing object types, durations, and entry/exit timestamps.
    - Snapshot gallery for visual verification of tracked objects.

  ---

  ## Data Flow Diagram

  ```mermaid
  graph TD
      A[Frontend: Upload] -->|Video File| B(Backend: /api/upload)
      B -->|job_id| C[Frontend: ROI Selection]
      C -->|Polygons| D(Backend: /api/process)
      D --> E{VideoProcessor}
      E -->|YOLO Tracking| F[data/output/job_id/]
      F -->|Video/CSV/DB| G[Frontend: Results]
  ```

  ## Environment & Dependencies
  - **Backend:** Python 3.10+, FastAPI, Ultralytics (YOLO), Supervision, OpenCV, ImageIO (FFmpeg).
  - **Frontend:** React, TypeScript, Vite, TailwindCSS.
  - **Models:** YOLOv11n (Pretrained).
