import os
import re
from huggingface_hub import HfApi, hf_hub_download
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
HF_REPO = os.getenv("HF_REPO")

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Pull missing data files from HF.")
    parser.add_argument("--refresh", action="store_true",
                        help="Re-download sidecar JSONs even when present locally.")
    cli = parser.parse_args()

    if not HF_REPO:
        print("Error: HF_REPO not found in .env")
        return

    api = HfApi()
    
    print(f"Fetching existing file list from Hugging Face repo: {HF_REPO}...")
    try:
        hf_files = api.list_repo_files(repo_id=HF_REPO, repo_type="dataset")
    except Exception as e:
        print(f"Failed to fetch file list from Hugging Face: {e}")
        return

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'data'))
    os.makedirs(base_dir, exist_ok=True)

    download_count = 0
    for hf_path in hf_files:
        if not (hf_path.endswith('.parquet') or hf_path.endswith('.json')):
            continue

        if hf_path.startswith('data/'):
            rel_path = hf_path[5:]
        elif re.match(r'^\d{4}/', hf_path):
            rel_path = hf_path
        else:
            continue

        local_path = os.path.join(base_dir, rel_path)

        # Parquets are immutable once ingested, JSON sidecars gain patches
        # over time, so --refresh re-pulls JSONs to pick up enrichments.
        if os.path.exists(local_path):
            if cli.refresh and hf_path.endswith('.json'):
                print(f"Refreshing from HF: {hf_path}")
            else:
                continue
        else:
            print(f"Downloading missing file from HF: {hf_path}")

        try:
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            downloaded_path = hf_hub_download(
                repo_id=HF_REPO,
                repo_type="dataset",
                filename=hf_path,
                local_dir=base_dir if not hf_path.startswith('data/') else os.path.dirname(base_dir),
            )
            download_count += 1
        except Exception as e:
            print(f"Failed to download {hf_path}: {e}")

    print(f"Download complete. Downloaded {download_count} new files.")

if __name__ == '__main__':
    main()
