import os
import sqlite3
import gzip
import shutil
from google.cloud import storage
from datetime import datetime, timezone

# --- Configuration ---
DB_PATH = os.environ["DB_PATH"]
TMP_BACKUP = "/tmp/backup.sqlite"
GZ_BACKUP = "/tmp/backup.sqlite.gz"
BUCKET_NAME = os.environ["GCS_BUCKET_NAME"]

def create_backup():
    try:
        # --- Create temporary file with the key ---
        with open("/tmp/gcs-key.json", "w") as f:
            f.write(os.environ["GCS_KEY_JSON"])
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/tmp/gcs-key.json"

        # --- 1. Backup SQLite safely ---
        src_conn = sqlite3.connect(DB_PATH)
        dest_conn = sqlite3.connect(TMP_BACKUP)
        src_conn.backup(dest_conn)
        dest_conn.close()
        src_conn.close()

        # --- 2. Compress ---
        with open(TMP_BACKUP, "rb") as f_in, gzip.open(GZ_BACKUP, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

        # --- 3. Upload to GCS ---
        client = storage.Client()
        bucket = client.get_bucket(BUCKET_NAME)

        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M")
        blob = bucket.blob(f"backups/farm-backup-{ts}.sqlite.gz")
        blob.upload_from_filename(GZ_BACKUP)

        print(f"Backup uploaded to gs://{BUCKET_NAME}/backups/farm-backup-{ts}.sqlite.gz")
    except Exception as e:
        print(f"Error creating backup: {e}")
        raise e

def main():
    create_backup()
    print("Backup created successfully")

if __name__ == "__main__":
    main()