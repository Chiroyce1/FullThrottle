"""Fill in enrichment blocks that older saved session JSONs are missing.

Idempotent: each file records completed enrichments in
meta["ingest"]["enrichments"], so re-running only touches files that are
missing something. Run directly or as the middle step of sync.py.

Usage:
    python3 backfill.py --year 2026
    python3 backfill.py --year 2026 --dry-run
    python3 backfill.py --year 2026 --force   # re-apply everything
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fastf1
from enrichments.weather import add_weather
from enrichments.results import add_results

RD_PATTERN = re.compile(r"f1_(\d+)_rd(\d+)_([a-z0-9]+)\.json$")
TEST_PATTERN = re.compile(r"f1_(\d+)_test(\d+)_(day\d+)\.json$")


def parse_filename(fname):
    m = RD_PATTERN.match(fname)
    if m:
        return {"year": int(m.group(1)), "round": int(m.group(2)), "code": m.group(3)}
    m = TEST_PATTERN.match(fname)
    if m:
        return {
            "year": int(m.group(1)),
            "test": int(m.group(2)),
            "code": m.group(3),
        }
    return None


def load_for_session(info):
    if "test" in info:
        day = int(info["code"].replace("day", ""))
        return fastf1.get_testing_session(info["year"], info["test"], day)
    return fastf1.get_session(info["year"], info["round"], info["code"].upper())


def backfill_all(data_dir, force=False, dry_run=False, year=None, rounds=None):
    files = sorted(f for f in os.listdir(data_dir) if f.endswith(".json"))
    filled, skipped, failed = 0, 0, 0

    for fname in files:
        info = parse_filename(fname)
        if info is None:
            continue
        if year and info["year"] != year:
            continue
        if rounds and info.get("round") not in rounds:
            continue

        path = os.path.join(data_dir, fname)
        with open(path) as f:
            meta = json.load(f)

        # Each writer overwrites its own block, so skipping files that
        # already have both blocks is purely a speed shortcut.
        needs_weather = force or "weather_series" not in meta.get("session_info", {})
        needs_results = force or "session_results" not in meta
        if not needs_weather and not needs_results:
            skipped += 1
            continue

        want = []
        if needs_weather:
            want.append("weather")
        if needs_results:
            want.append("results")
        if dry_run:
            print(f"would fill {fname}: {', '.join(want)}")
            continue

        print(f"fill {fname}: {', '.join(want)}...")
        try:
            session = load_for_session(info)
            session.load(telemetry=False, laps=needs_results, weather=needs_weather)
            if needs_weather:
                add_weather(session, meta)
            if needs_results:
                add_results(session, meta)
            with open(path, "w") as f:
                json.dump(meta, f, indent=4)
            filled += 1
        except Exception as err:
            print(f"  FAILED: {err}")
            failed += 1

    print(f"\nDone: {filled} filled, {skipped} already complete, {failed} failed.")
    return filled, skipped, failed


def main():
    parser = argparse.ArgumentParser(description="Backfill saved session JSONs.")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--round", dest="rounds", action="append", type=int, default=None)
    parser.add_argument("--force", action="store_true", help="Rewrite blocks even when present.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--data-dir", default=None)
    args = parser.parse_args()

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cache_dir = os.environ.get("FASTF1_CACHE", os.path.join(repo_root, ".fastf1_cache"))
    os.makedirs(cache_dir, exist_ok=True)
    fastf1.Cache.enable_cache(cache_dir)

    if args.data_dir:
        data_dirs = [args.data_dir]
    elif args.year:
        data_dirs = [os.path.join(repo_root, "static", "data", str(args.year))]
    else:
        base = os.path.join(repo_root, "static", "data")
        data_dirs = [os.path.join(base, d) for d in sorted(os.listdir(base))]

    total = [0, 0, 0]
    for data_dir in data_dirs:
        if not os.path.isdir(data_dir):
            continue
        r = backfill_all(data_dir, force=args.force, dry_run=args.dry_run,
                      year=args.year, rounds=args.rounds)
        total = [a + b for a, b in zip(total, r)]

    print(f"Total: {total[0]} enriched, {total[1]} already complete, {total[2]} failed.")


if __name__ == "__main__":
    main()
