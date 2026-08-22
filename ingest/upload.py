import os
from huggingface_hub import HfApi
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
HF_REPO = os.getenv("HF_REPO")

def main():
    if not HF_REPO:
        print("Error: HF_REPO not found in .env")
        return

    api = HfApi()
    
    print(f"Fetching existing file list from Hugging Face repo: {HF_REPO}...")
    try:
        hf_files = set(api.list_repo_files(repo_id=HF_REPO, repo_type="dataset"))
    except Exception as e:
        print(f"Failed to fetch file list from Hugging Face: {e}")
        return

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'data'))
    
    if not os.path.exists(base_dir):
        print(f"Local data directory not found: {base_dir}")
        return

    upload_count = 0
    # Walk through local data directory
    for root, _, files in os.walk(base_dir):
        for file in files:
            if not file.endswith('.parquet') and not file.endswith('.json'):
                continue
                
            local_path = os.path.join(root, file)
            # Calculate path relative to static/data
            rel_path = os.path.relpath(local_path, base_dir)
            # HF path structure is data/{year}/filename
            hf_path = f"data/{rel_path}"

            if hf_path not in hf_files:
                print(f"Uploading missing file to HF: {hf_path}")
                try:
                    api.upload_file(
                        path_or_fileobj=local_path,
                        path_in_repo=hf_path,
                        repo_id=HF_REPO,
                        repo_type="dataset"
                    )
                    upload_count += 1
                except Exception as e:
                    print(f"Failed to upload {hf_path}: {e}")

    print(f"Upload complete. Uploaded {upload_count} new files.")

if __name__ == '__main__':
    main()
