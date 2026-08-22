import os
from huggingface_hub import HfApi
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
HF_REPO = os.getenv("HF_REPO")
HF_TOKEN = os.getenv("HF_TOKEN") or os.getenv("HF_WRITE_KEY")

def main():
    if not HF_REPO:
        print("Error: HF_REPO not found in .env")
        return

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'data'))
    
    if not os.path.exists(base_dir):
        print(f"Local data directory not found: {base_dir}")
        return

    api = HfApi(token=HF_TOKEN)
    
    print(f"Syncing data to Hugging Face repo: {HF_REPO} (single atomic commit)...")
    try:
        commit_info = api.upload_folder(
            folder_path=base_dir,
            repo_id=HF_REPO,
            repo_type="dataset",
            commit_message="data: sync telemetry dataset",
        )
        print("Upload complete in single commit.")
    except Exception as e:
        print(f"Failed to upload to Hugging Face: {e}")

if __name__ == '__main__':
    main()
