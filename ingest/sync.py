"""
Orchestrator for the telemetry ingest pipeline.
Runs the steps in order:
  1. ingest_openf1.py    - fetch and convert new sessions (defaults to OpenF1, zero credentials)
  2. backfill.py         - enrich saved sessions (quali phases, weather, classification)
  3. build_metadata.py   - compile static/metadata.json
  4. upload.py           - (optional) commit to Hugging Face CDN

Usage:
  python ingest/sync.py 2026 --upload
  python ingest/sync.py 2026 --round 18 --session r --upload
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run_step(label, cmd):
    print(f"\n===== {label} =====")
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=HERE)
    if result.returncode != 0:
        print(f"Step failed ({label}), stopping.")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="Sync local F1 data end to end.")
    parser.add_argument("year", nargs="?", type=int, default=2026)
    parser.add_argument("--round", dest="rounds", action="append", type=int, default=[])
    parser.add_argument("--session", dest="sessions", action="append", default=[])
    parser.add_argument("--fastf1", action="store_true", help="Use FastF1 instead of default OpenF1.")
    parser.add_argument("--openf1", action="store_true", default=True, help=argparse.SUPPRESS)
    parser.add_argument("--skip-ingest", action="store_true")
    parser.add_argument("--skip-backfill", action="store_true")
    parser.add_argument("--skip-patches", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--skip-metadata", action="store_true")
    parser.add_argument("--upload", action="store_true", help="Push to Hugging Face at the end.")
    parser.add_argument("--force-backfill", action="store_true", help="Re-apply all enrichments.")
    parser.add_argument("--force-patches", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    py = sys.executable

    # 1. New sessions.
    if not args.skip_ingest and not args.dry_run:
        if args.fastf1:
            cmd = [py, "ingest.py", str(args.year)]
            for r in args.rounds or []:
                cmd += ["--round", str(r)]
            for s in args.sessions or []:
                cmd += ["--session", s]
            print(f"\n===== ingest new sessions (FastF1) =====")
            print(f"$ {' '.join(cmd)}")
            result = subprocess.run(cmd, cwd=HERE)
            if result.returncode != 0:
                print("\nFastF1 failed (likely F1 TV 401 gate). Automatically falling back to OpenF1 pipeline...")
                cmd_openf1 = [py, "ingest_openf1.py", str(args.year)]
                for r in args.rounds or []:
                    cmd_openf1 += ["--round", str(r)]
                for s in args.sessions or []:
                    cmd_openf1 += ["--session", s]
                run_step("ingest new sessions (OpenF1 fallback)", cmd_openf1)
        else:
            cmd = [py, "ingest_openf1.py", str(args.year)]
            for r in args.rounds or []:
                cmd += ["--round", str(r)]
            for s in args.sessions or []:
                cmd += ["--session", s]
            run_step("ingest new sessions (OpenF1)", cmd)
    else:
        print("\n===== ingest new sessions (skipped) =====")

    # 2. Enrich saved sessions, including anything just ingested.
    if not (args.skip_backfill or args.skip_patches):
        print("\n===== enrich saved sessions =====")
        from backfill import backfill_all

        repo_root = os.path.dirname(HERE)
        data_dir = os.path.join(repo_root, "static", "data", str(args.year))
        if os.path.isdir(data_dir):
            backfill_all(
                data_dir,
                force=(args.force_backfill or args.force_patches),
                dry_run=args.dry_run,
                year=args.year,
                rounds=args.rounds or None,
            )
        else:
            print(f"No local data dir yet: {data_dir}")
    else:
        print("\n===== enrich saved sessions (skipped) =====")

    # 3. Rebuild the session index.
    if not args.skip_metadata and not args.dry_run:
        run_step("rebuild metadata", [py, "build_metadata.py"])
    else:
        print("\n===== rebuild metadata (skipped) =====")

    # 4. Upload. Explicit only, since this publishes to the live CDN.
    if args.upload and not args.dry_run:
        run_step("upload to Hugging Face", [py, "upload.py"])
    else:
        print("\n===== upload to Hugging Face (skipped, pass --upload) =====")

    print("\nSync complete.")


if __name__ == "__main__":
    main()
