"""
Zero-dependency pre-flight check for GitHub Actions telemetry sync.
Uses only standard library (urllib, json) to complete in <1 second.
Checks whether any completed F1 session is missing from static/metadata.json.

Exit codes / outputs:
- Prints has_pending=true/false to GITHUB_OUTPUT (or stdout).
"""

import os
import sys
import json
import urllib.request
from datetime import datetime, timezone

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"
OPENF1_BASE = "https://api.openf1.org/v1"

def get_processed_sessions(metadata_path, year):
    processed = set()
    if not os.path.exists(metadata_path):
        return processed
    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
        for y_data in metadata.get("years", []):
            if y_data.get("year") == year:
                for r_data in y_data.get("rounds", []):
                    r_num = r_data.get("round")
                    is_test = (r_num == 0)
                    for s_data in r_data.get("sessions", []):
                        code = s_data.get("code")
                        if is_test:
                            processed.add(f"f1_{year}_{code}")
                        else:
                            processed.add(f"f1_{year}_rd{r_num}_{code}")
    except Exception as e:
        print(f"Warning: could not read metadata.json: {e}", file=sys.stderr)
    return processed

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "FullThrottle-PreCheck/1.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))

def check_pending(year=2026):
    here = os.path.dirname(os.path.abspath(__file__))
    metadata_path = os.path.abspath(os.path.join(here, "..", "static", "metadata.json"))
    processed = get_processed_sessions(metadata_path, year)

    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    # 1. Fetch Jolpica race calendar
    try:
        data = fetch_json(f"{JOLPICA_BASE}/{year}.json")
        races = data.get("MRData", {}).get("RaceTable", {}).get("Races", [])
    except Exception as e:
        print(f"Jolpica schedule fetch failed ({e}), defaulting to run full pipeline.", file=sys.stderr)
        return True, ["calendar_unavailable"]

    pending = []
    for race in races:
        try:
            r_date = datetime.strptime(race.get("date", ""), "%Y-%m-%d").date()
            if r_date <= today:
                r_num = int(race.get("round", 0))
                # Check if at least qualifying and race are processed
                for code in ["q", "r"]:
                    session_key = f"f1_{year}_rd{r_num}_{code}"
                    if session_key not in processed:
                        pending.append(session_key)
        except Exception:
            continue

    return len(pending) > 0, pending

def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    has_pending, missing = check_pending(year)

    print(f"Pending sessions check for {year}: has_pending={has_pending}")
    if missing:
        print(f"Missing sessions ({len(missing)}): {', '.join(missing[:10])}")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output and os.path.exists(github_output):
        with open(github_output, "a") as f:
            f.write(f"has_pending={'true' if has_pending else 'false'}\n")

if __name__ == "__main__":
    main()
