import os
import sys
import uuid

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import settings
from core.processor import VideoProcessor


def main():
    input_path = settings.INPUT_VIDEO_PATH
    if not os.path.isfile(input_path):
        print(f"Error: input video not found at {input_path}")
        sys.exit(1)

    job_id = uuid.uuid4().hex
    output_dir = os.path.join(settings.OUTPUT_DIR, job_id)
    os.makedirs(output_dir, exist_ok=True)

    output_video = os.path.join(output_dir, "output_result.mp4")
    output_csv = os.path.join(output_dir, "zone_analytics.csv")

    print("--- Starting AI Tracking Backend (CLI) ---")
    processor = VideoProcessor(
        job_id=job_id,
        input_path=input_path,
        output_path=output_video,
        csv_path=output_csv,
        zones=[],
    )

    try:
        total_count = processor.process_video()
        print(f"Success! Total unique tracked objects: {total_count}")
        print(f"Video: {output_video}")
        print(f"CSV:   {output_csv}")
    except Exception as e:
        print(f"Error during processing: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
