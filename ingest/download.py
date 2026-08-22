import os
from huggingface_hub import HfApi, hf_hub_download
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
        hf_files = api.list_repo_files(repo_id=HF_REPO, repo_type="dataset")
    except Exception as e:
        print(f"Failed to fetch file list from Hugging Face: {e}")
        return

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'static', 'data'))
    os.makedirs(base_dir, exist_ok=True)

    download_count = 0
    for hf_path in hf_files:
        if not hf_path.startswith('data/') or (not hf_path.endswith('.parquet') and not hf_path.endswith('.json')):
            continue

        # hf_path is like data/2026/f1_2026_rd1_fp1.parquet
        # local_path should be static/data/2026/f1_2026_rd1_fp1.parquet
        rel_path = hf_path[5:] # remove 'data/' prefix
        local_path = os.path.join(base_dir, rel_path)

        if not os.path.exists(local_path):
            print(f"Downloading missing file from HF: {hf_path}")
            try:
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                downloaded_path = hf_hub_download(
                    repo_id=HF_REPO,
                    repo_type="dataset",
                    filename=hf_path,
                    local_dir=os.path.dirname(base_dir), # hf_hub_download maps local_dir/hf_path, so base_dir is static/data, and hf_path has data/ inside it, so we want local_dir=static
                    # Actually, if we use local_dir=static, then local_dir/data/... works!
                )
                download_count += 1
            except Exception as e:
                print(f"Failed to download {hf_path}: {e}")

    print(f"Download complete. Downloaded {download_count} new files.")

if __name__ == '__main__':
    main()
