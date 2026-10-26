import os
import zipfile

def zip_backend():
    # Get the parent directory of the current script (which is 'collab')
    # then go one level up to get the project root
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(root_dir, "backend")
    output_zip = os.path.join(root_dir, "collab", "backend.zip")

    print(f"Zipping {backend_dir} into {output_zip}...")

    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(backend_dir):
            # Exclude virtual environments and cache
            dirs[:] = [d for d in dirs if d not in ['.venv', '__pycache__', 'data', 'runs']]
            for file in files:
                file_path = os.path.join(root, file)
                # Create a relative path for the zip file
                rel_path = os.path.relpath(file_path, backend_dir)
                # We want the contents of 'backend' to be at the root of the zip
                zipf.write(file_path, rel_path)

    print("Success! backend.zip created.")

if __name__ == "__main__":
    zip_backend()
