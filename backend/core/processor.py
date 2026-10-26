import cv2
import numpy as np
import pandas as pd
from ultralytics import YOLO
import supervision as sv
import os
from config import settings
from api import db

class VideoProcessor:
    def __init__(self, job_id: str, input_path: str, output_path: str, csv_path: str, zones: list):
        self.job_id = job_id
        self.input_path = input_path
        self.output_path = output_path
        self.csv_path = csv_path
        
        # Load YOLO model – use custom path if it exists, otherwise fall back to a built‑in pretrained model
        model_path = settings.MODEL_PATH
        if not os.path.isfile(model_path):
            # Use a lightweight default model bundled with ultralytics
            self.model = YOLO('yolov8n.pt')
        else:
            self.model = YOLO(model_path)
        self.video_info = sv.VideoInfo.from_video_path(self.input_path)
        
        # Load custom ROI zones or use default fallback
        if not zones:
            zones = [{
                "id": "default",
                "name": "Default Zone",
                "polygon": settings.POLYGON.tolist()
            }]
            
        self.zones = []
        # Predefined list of colors for rendering zone boundaries
        colors = [
            sv.Color(r=239, g=68, b=68),    # Red
            sv.Color(r=16, g=185, b=129),   # Green
            sv.Color(r=59, g=130, b=246),   # Blue
            sv.Color(r=245, g=158, b=11),   # Yellow
            sv.Color(r=139, g=92, b=246),   # Purple
            sv.Color(r=6, g=182, b=212)     # Cyan
        ]
        
        for idx, z in enumerate(zones):
            poly = np.array(z["polygon"], dtype=np.int32)
            polygon_zone = sv.PolygonZone(polygon=poly)
            zone_color = colors[idx % len(colors)]
            zone_annotator = sv.PolygonZoneAnnotator(
                zone=polygon_zone, 
                color=zone_color
            )
            self.zones.append({
                "id": z["id"],
                "name": z["name"],
                "polygon": poly,
                "zone": polygon_zone,
                "annotator": zone_annotator,
                "color": zone_color
            })

        # Annotators
        self.box_annotator = sv.BoxAnnotator()
        self.label_annotator = sv.LabelAnnotator()
        
        # Internal tracker states
        # Key: "{tracker_id}_{zone_id}" -> State dict
        self.active_objects = {}
        self.finished_objects = []
        self.counted_ids = set()
        
        # Map classes
        self.class_names = self.model.names

    def _detections_in_zone(self, polygon: np.ndarray, detections: sv.Detections) -> np.ndarray:
        """Check bottom-center anchor against full-frame polygon coordinates."""
        if len(detections) == 0:
            return np.array([], dtype=bool)
        inside = []
        for i in range(len(detections)):
            x1, y1, x2, y2 = detections.xyxy[i]
            anchor_x = float((x1 + x2) / 2)
            anchor_y = float(y2)
            inside.append(cv2.pointPolygonTest(polygon, (anchor_x, anchor_y), False) >= 0)
        return np.array(inside, dtype=bool)

    def process_video(self):
        """Process the video using ImageIO for output writing.
        This avoids the OpenCV H.264 codec dependency by leveraging ImageIO's
        bundled FFmpeg, which includes libx264 and works on Windows out‑of‑the‑box.
        Frames are still processed with the YOLO tracker and annotated using
        OpenCV (BGR). Before writing each frame we convert it to RGB for ImageIO.
        """
        import imageio
        # ImageIO expects RGB; OpenCV gives BGR, so we will convert per frame.
        writer = imageio.get_writer(
            self.output_path,
            fps=self.video_info.fps,
            codec='libx264',  # uses the bundled libx264 codec
            quality=8  # reasonable quality/compression balance
        )

        results = self.model.track(
            source=self.input_path,
            tracker=settings.TRACKER_TYPE,
            stream=True,
            persist=True,
            classes=settings.CLASSES,
            conf=settings.CONFIDENCE_THRESHOLD
        )

        total_frames = self.video_info.total_frames or 1

        for frame_number, result in enumerate(results):
            annotated_frame = self._process_frame(frame_number, result)
            # Convert BGR (OpenCV) -> RGB for ImageIO
            rgb_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
            writer.append_data(rgb_frame)

            # Update SQLite job progress
            progress = min(1.0, (frame_number + 1) / total_frames)
            db.update_job_progress(self.job_id, progress, frame_number + 1, total_frames)

        print("DEBUG: Detection loop finished. Finalizing...")
        # Finalize and record any objects remaining inside zones at the end of the video
        self._finalize_active_objects(total_frames)
        print("DEBUG: Closing writer...")
        writer.close()
        print("DEBUG: Saving results to CSV and DB...")
        self._save_results()
        print("DEBUG: Results saved.")
        
        return len(self.counted_ids)

    def _process_frame(self, frame_number, result):
        frame = result.orig_img
        detections = sv.Detections.from_ultralytics(result)
        
        # Ensure we have tracker IDs for each detection – use existing IDs if present, otherwise generate temporary sequential IDs
        ids_list = detections.tracker_id if detections.tracker_id is not None and len(detections.tracker_id) > 0 else list(range(len(detections)))

        current_ids_inside_zones = set()

        for z_data in self.zones:
            zone_id = z_data["id"]
            zone_name = z_data["name"]
            zone_obj = z_data["zone"]
            zone_poly = z_data["polygon"]
            
            is_inside = self._detections_in_zone(zone_poly, detections)
            
            # Use the generated ids_list for iteration
            for i, (tracker_id, inside) in enumerate(zip(ids_list, is_inside)):
                tracker_id = int(tracker_id)
                class_id = int(detections.class_id[i]) if detections.class_id is not None else 0
                obj_type = self.class_names.get(class_id, "Person").capitalize()
                
                # Normalize typical classes
                if obj_type == "Bicycle" or obj_type == "Motorcycle":
                    obj_type = "Bike"
                
                if inside:
                    key = f"{tracker_id}_{zone_id}"
                    current_ids_inside_zones.add(key)
                    self.counted_ids.add(tracker_id)
                    
                    if key not in self.active_objects:
                        self.active_objects[key] = {
                            "tracker_id": tracker_id,
                            "zone_id": zone_id,
                            "zone_name": zone_name,
                            "object_type": obj_type,
                            "enter_frame": frame_number,
                            "last_seen_frame": frame_number,
                            "frames_observed": 1,
                        }
                        # Generate snapshot on first entry
                        bbox = detections.xyxy[i]
                        self._save_snapshot(frame, tracker_id, zone_id, zone_name, bbox, frame_number)
                    else:
                        self.active_objects[key]["last_seen_frame"] = frame_number
                        self.active_objects[key]["frames_observed"] += 1

        # Check for exits
        self._handle_exits(frame_number, current_ids_inside_zones)

        # Draw annotations
        labels = []
        # Ensure each detection has a corresponding label.
        # If tracker IDs are missing, generate temporary sequential IDs.
        tracker_ids = detections.tracker_id if detections.tracker_id is not None and len(detections.tracker_id) > 0 else list(range(len(detections)))
        for i in range(len(detections)):
            tid = int(tracker_ids[i]) if i < len(tracker_ids) else i
            cid = int(detections.class_id[i]) if detections.class_id is not None else 0
            cname = self.class_names.get(cid, "Person").capitalize()
            conf = float(detections.confidence[i]) if detections.confidence is not None else 0.0
            labels.append(f"{cname} #{tid} {conf:.0%}")

        frame = self.box_annotator.annotate(scene=frame, detections=detections)
        frame = self.label_annotator.annotate(scene=frame, detections=detections, labels=labels)
        
        # Overlay zones on the frame
        for z_data in self.zones:
            frame = z_data["annotator"].annotate(scene=frame)
            
        # Draw surveillance stats sidebar overlay
        overlay = frame.copy()
        cv2.rectangle(overlay, (20, 20), (320, 45 + len(self.zones) * 30), (15, 23, 42), -1) # Dark slate bg
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
        
        cv2.putText(frame, "SURVEILLANCE ROI TELEMETRY", (35, 42), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        
        y_offset = 72
        for z_data in self.zones:
            zone_id = z_data["id"]
            zone_count = sum(1 for k in self.active_objects if k.endswith(f"_{zone_id}"))
            text = f"{z_data['name']}: {zone_count} Active"
            
            # Draw color indicator box
            rgb = (int(z_data["color"].r), int(z_data["color"].g), int(z_data["color"].b))
            cv2.rectangle(frame, (35, y_offset - 12), (47, y_offset), rgb, -1)
            
            cv2.putText(frame, text, (55, y_offset), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (241, 245, 249), 1, cv2.LINE_AA)
            y_offset += 25
            
        return frame

    def _save_snapshot(self, frame, tracker_id: int, zone_id: str, zone_name: str, bbox, frame_number: int):
        safe_zone_name = "".join([c if c.isalnum() else "_" for c in zone_name])

        # Compute crop region with padding
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = map(int, bbox)
        pad_x = int((x2 - x1) * 0.1)
        pad_y = int((y2 - y1) * 0.1)
        x1 = max(0, x1 - pad_x)
        y1 = max(0, y1 - pad_y)
        x2 = min(w, x2 + pad_x)
        y2 = min(h, y2 + pad_y)

        snapshot_path = None
        if x2 > x1 and y2 > y1:
            crop = frame[y1:y2, x1:x2]
            filename = f"{tracker_id}_{safe_zone_name}.jpg"
            out_dir = os.path.join(settings.OUTPUT_DIR, self.job_id, "snapshots")
            os.makedirs(out_dir, exist_ok=True)
            snapshot_path = os.path.join(out_dir, filename)
            try:
                cv2.imwrite(snapshot_path, crop)
            except Exception as e:
                print(f"Error saving snapshot image: {e}")
                snapshot_path = None

    def _handle_exits(self, frame_number: int, current_ids_inside_zones: set):
        active_keys = list(self.active_objects.keys())
        for key in active_keys:
            if key not in current_ids_inside_zones:
                obj_data = self.active_objects[key]
                tracker_id = obj_data["tracker_id"]
                zone_name = obj_data["zone_name"]
                enter_frame = obj_data["enter_frame"]
                frames_observed = obj_data["frames_observed"]
                
                duration = (frame_number - enter_frame) / self.video_info.fps
                exit_time_sec = frame_number / self.video_info.fps
                
                exit_time_str = self._format_time(exit_time_sec)
                duration_str = self._format_duration(duration)
                
                self.finished_objects.append({
                    "tracker_id": tracker_id,
                    "zone_id": obj_data["zone_id"],
                    "object_type": obj_data["object_type"],
                    "roi_name": zone_name,
                    "entry_time": self._format_time(enter_frame / self.video_info.fps),
                    "exit_time": exit_time_str,
                    "stay_duration": duration_str,
                    "frame_count": frames_observed
                })

                del self.active_objects[key]


    def _finalize_active_objects(self, last_frame_number: int):
        active_keys = list(self.active_objects.keys())
        for key in active_keys:
            obj_data = self.active_objects[key]
            tracker_id = obj_data["tracker_id"]
            zone_name = obj_data["zone_name"]
            enter_frame = obj_data["enter_frame"]
            frames_observed = obj_data["frames_observed"]
            
            duration = (last_frame_number - enter_frame) / self.video_info.fps
            exit_time_sec = last_frame_number / self.video_info.fps
            
            exit_time_str = self._format_time(exit_time_sec)
            duration_str = self._format_duration(duration)
            
            self.finished_objects.append({
                "tracker_id": tracker_id,
                "zone_id": obj_data["zone_id"],
                "object_type": obj_data["object_type"],
                "roi_name": zone_name,
                "entry_time": self._format_time(enter_frame / self.video_info.fps),
                "exit_time": exit_time_str,
                "stay_duration": duration_str,
                "frame_count": frames_observed
            })
            
            del self.active_objects[key]

    def _format_time(self, seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def _format_duration(self, seconds: float) -> str:
        m = int(seconds // 60)
        s = int(seconds % 60)
        return f"{m:02d}:{s:02d}"

    def _save_results(self):
        # Format object CSV file output
        output_rows = []
        for item in self.finished_objects:
            output_rows.append({
                "Object ID": f"{item['object_type']}_{item['tracker_id']:03d}",
                "Object Type": item["object_type"],
                "ROI": item["roi_name"],
                "Entry Time": item["entry_time"],
                "Exit Time": item["exit_time"],
                "Stay Duration": item["stay_duration"],
                "Frame Count": item["frame_count"]
            })
        
        df = pd.DataFrame(output_rows) if output_rows else pd.DataFrame(
            columns=["Object ID", "Object Type", "ROI", "Entry Time", "Exit Time", "Stay Duration", "Frame Count"]
        )
        df.to_csv(self.csv_path, index=False)
        self._persist_analytics_to_db()

    def _persist_analytics_to_db(self):
        events = []
        for item in self.finished_objects:
            safe_zone = "".join([c if c.isalnum() else "_" for c in item["roi_name"]])
            tracker_id = item["tracker_id"]
            event_id = f"{self.job_id}_{tracker_id}_{safe_zone}_{len(events)}"
            snap_path = os.path.join(
                settings.OUTPUT_DIR,
                self.job_id,
                "snapshots",
                f"{tracker_id}_{safe_zone}.jpg",
            )
            if not os.path.isfile(snap_path):
                snap_path = None
            events.append({
                "id": event_id,
                "tracker_id": tracker_id,
                "object_type": item["object_type"],
                "roi_id": item.get("zone_id", safe_zone),
                "roi_name": item["roi_name"],
                "entry_time": item["entry_time"],
                "exit_time": item.get("exit_time"),
                "stay_duration": item.get("stay_duration"),
                "frame_count": item.get("frame_count", 0),
                "snapshot_path": snap_path,
            })
        db.replace_job_analytics(self.job_id, events)
