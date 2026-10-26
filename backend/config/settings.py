import numpy as np
import os

# --- Paths ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

# All user uploads (input videos) live under data/uploads
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
# All processed artifacts live under data/output
OUTPUT_DIR = os.path.join(DATA_DIR, "output")
DB_PATH = os.path.join(DATA_DIR, "surveillance.db")

MODEL_PATH = os.path.join(BASE_DIR, "models", "yolo12m.pt")
INPUT_VIDEO_PATH = os.path.join(UPLOAD_DIR, "cctv1.mp4")
OUTPUT_VIDEO_PATH = os.path.join(OUTPUT_DIR, "output_result.mp4")
OUTPUT_CSV_PATH = os.path.join(OUTPUT_DIR, "zone_analytics.csv")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- CORS (dev frontend origins) ---
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*", # Allow all for Colab tunneling
]

# --- Tracking Settings ---
CLASSES = [0, 1, 2, 3, 5, 7]  # Person, Bicycle, Car, Motorcycle, Bus, Truck
TRACKER_TYPE = "bytetrack.yaml"
CONFIDENCE_THRESHOLD = 0.35

# --- Zone Configuration ---
# Default fallback zone if none specified
POLYGON = np.array([
    [334, 82],
    [486, 82],
    [486, 270],
    [334, 270]
])
