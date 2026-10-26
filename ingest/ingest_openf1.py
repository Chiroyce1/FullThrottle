"""
OpenF1 session ingestion pipeline CLI for FullThrottle.
Fetches high-frequency telemetry, lap data, weather, and classification
directly from OpenF1 (and Jolpica/Ergast for official FIA classifications)
without requiring any F1 TV credentials or subscription tokens.

Outputs identical schema and Parquet / JSON formats as FastF1 core.py.
"""

import argparse
import json
import os
import warnings
from datetime import datetime, timezone
import pandas as pd

from utils import get_processed_sessions
from openf1.constants import OPENF1_BASE, JOLPICA_BASE, TYPE_MAP, ESSENTIAL_COLUMNS, get_session_code
from openf1.client import OpenF1Client
from openf1.meeting import fetch_meeting_and_sessions, fetch_year_schedule
from openf1.telemetry import build_driver_telemetry
from openf1.formatter import (
    build_driver_metadata,
    build_weather_metadata,
    build_classification
)

pd.set_option('future.no_silent_downcasting', True)
warnings.filterwarnings('ignore', category=FutureWarning)


def ingest_session(
    client: OpenF1Client,
    year: int,
    round_id: int,
    session_obj: dict,
    race_name: str,
    circuit_name: str,
    country_name: str,
    output_dir: str = None
):
    session_key = session_obj["session_key"]
    session_code = get_session_code(session_obj)
    session_display_name = session_code.upper()

    print(f"\n=======================================================")
    print(f"Ingesting {year} Round {round_id} - {session_obj.get('session_name')} (Code: {session_code}, Key: {session_key})")
    print(f"=======================================================")

    session_start = datetime.fromisoformat(session_obj["date_start"].replace("Z", "+00:00"))
    date_str = session_start.strftime("%Y-%m-%d")

    # 1. Fetch Drivers
    drivers_list = client.get(f"{OPENF1_BASE}/drivers", params={"session_key": session_key}) or []
    if not drivers_list:
        print(f"No drivers found for session {session_key}")
        return

    # De-duplicate drivers by driver_number
    unique_drivers = {}
    for d in drivers_list:
        num = d.get("driver_number")
        if num is not None and num not in unique_drivers:
            unique_drivers[num] = d

    print(f"Found {len(unique_drivers)} drivers for session.")

    # 2. Fetch Laps, Stints, Intervals, and Positions
    print("Fetching session context (laps, stints, intervals, positions, weather)...")
    laps_raw = client.get(f"{OPENF1_BASE}/laps", params={"session_key": session_key}) or []
    laps_df = pd.DataFrame(laps_raw)

    stints_raw = client.get(f"{OPENF1_BASE}/stints", params={"session_key": session_key}) or []
    stints_df = pd.DataFrame(stints_raw)

    intervals_raw = client.get(f"{OPENF1_BASE}/intervals", params={"session_key": session_key}) or []
    intervals_df = pd.DataFrame(intervals_raw)

    pos_raw = client.get(f"{OPENF1_BASE}/position", params={"session_key": session_key}) or []
    pos_df = pd.DataFrame(pos_raw)

    weather_raw = client.get(f"{OPENF1_BASE}/weather", params={"session_key": session_key}) or []

    # 3. Fetch Jolpica Ergast Results for official session classifications
    jolpica_results = []
    endpoint_code = "results" if session_code == "r" else "qualifying" if session_code == "q" else "sprint" if session_code == "s" else None
    if endpoint_code:
        try:
            j_resp = client.get(f"{JOLPICA_BASE}/{year}/{round_id}/{endpoint_code}.json")
            if j_resp and "MRData" in j_resp and "RaceTable" in j_resp["MRData"] and j_resp["MRData"]["RaceTable"]["Races"]:
                race_node = j_resp["MRData"]["RaceTable"]["Races"][0]
                res_key = "Results" if "Results" in race_node else "QualifyingResults" if "QualifyingResults" in race_node else "SprintResults"
                jolpica_results = race_node.get(res_key, [])
        except Exception as e:
            print(f"Jolpica Ergast query failed: {e}")

    results_by_num = {str(r.get("number")): r for r in jolpica_results}

    # 4. Fetch telemetry and location for each driver
    all_driver_dfs = []
    metadata_drivers = {}

    total_drivers = len(unique_drivers)
    for idx, (dnum, dinfo) in enumerate(unique_drivers.items(), 1):
        name_str = dinfo.get("full_name") or dinfo.get("broadcast_name") or f"Driver {dnum}"
        print(f"[{idx}/{total_drivers}] Downloading telemetry for #{dnum} ({name_str})...", end="", flush=True)

        try:
            df_drv = build_driver_telemetry(
                client=client,
                session_key=session_key,
                driver=dinfo,
                session_start=session_start,
                laps_df=laps_df,
                stints_df=stints_df,
                intervals_df=intervals_df,
                pos_df=pos_df
            )
            if df_drv is not None and not df_drv.empty:
                all_driver_dfs.append(df_drv)
                print(f" OK ({len(df_drv):,} pts)")
            else:
                print(" No telemetry data.")
        except Exception as err:
            print(f" Error: {err}")

        # Build Driver Metadata
        metadata_drivers[str(dnum)] = build_driver_metadata(
            dnum=dnum,
            dinfo=dinfo,
            laps_df=laps_df,
            stints_df=stints_df,
            pos_df=pos_df,
            results_by_num=results_by_num,
            session_start=session_start
        )

    if not all_driver_dfs:
        raise RuntimeError(f"No telemetry collected for session {session_key}")

    # 5. Merge all driver telemetries into master dataframe
    print("\nMerging telemetry across all drivers...")
    master_df = pd.concat(all_driver_dfs, ignore_index=True)

    master_df["compound"] = master_df["compound"].astype("category")
    for col, dtype in TYPE_MAP.items():
        if col in master_df.columns:
            if dtype.startswith("uint"):
                master_df[col] = pd.to_numeric(master_df[col], errors="coerce").fillna(0).round(0).astype(dtype)
            else:
                master_df[col] = master_df[col].astype(dtype)

    final_df = master_df[[c for c in ESSENTIAL_COLUMNS if c in master_df.columns]].copy()

    # 6. Build Weather and Classification Metadata
    weather_summary, weather_series = build_weather_metadata(weather_raw, session_start)
    classification = build_classification(jolpica_results)

    total_laps = int(final_df["lap_number"].max()) if "lap_number" in final_df.columns else None

    metadata = {
        "session_info": {
            "name": race_name or session_obj.get("meeting_name") or f"{country_name} Grand Prix",
            "type": session_obj.get("session_name", "Race"),
            "round": round_id,
            "year": year,
            "country": country_name or session_obj.get("country_name"),
            "location": session_obj.get("location"),
            "circuit": circuit_name or session_obj.get("circuit_short_name"),
            "date": date_str,
            "session_name": session_display_name,
            "session_code": session_code,
            "totalLaps": total_laps,
            "weather": weather_summary,
            "weather_series": weather_series
        },
        "drivers": metadata_drivers,
        "session_results": classification
    }

    # 7. Save Parquet and JSON files
    base_name = f"f1_{year}_rd{round_id}_{session_code}"
    target_dir = output_dir or os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "data", str(year))
    os.makedirs(target_dir, exist_ok=True)

    parquet_path = os.path.join(target_dir, f"{base_name}.parquet")
    json_path = os.path.join(target_dir, f"{base_name}.json")

    final_df.to_parquet(parquet_path, engine="pyarrow", compression="zstd")
    with open(json_path, "w") as jf:
        json.dump(metadata, jf, indent=4)

    print(f"Generated: {parquet_path} ({len(final_df):,} rows)")
    print(f"Generated: {json_path}")


def main():
    parser = argparse.ArgumentParser(description="Ingest F1 telemetry from OpenF1")
    parser.add_argument("year", type=int, nargs="?", default=2026, help="Season year (e.g. 2026)")
    parser.add_argument("--round", type=int, default=None, help="Round number (e.g. 18 for USA GP)")
    parser.add_argument("--session", type=str, default="all", help="Session code: r, q, fp1, fp2, fp3, s, sq, or all")
    parser.add_argument("--force", action="store_true", help="Force re-download even if already processed")
    parser.add_argument("--output-dir", type=str, default=None, help="Output directory path for parquet and json")
    args = parser.parse_args()

    client = OpenF1Client(request_delay=0.5)
    processed_sessions = get_processed_sessions(args.year)
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    rounds_to_check = []
    if args.round is not None:
        rounds_to_check.append(args.round)
    else:
        # Auto-discover completed rounds
        schedule = fetch_year_schedule(client, args.year)
        for race in schedule:
            try:
                r_date = datetime.strptime(race.get("date", ""), "%Y-%m-%d").date()
                if r_date <= today:
                    rounds_to_check.append(int(race.get("round")))
            except Exception:
                continue

    if not rounds_to_check:
        print(f"No completed rounds found for {args.year}.")
        return

    target_session_code = args.session.lower()
    for round_id in rounds_to_check:
        try:
            sessions, race_name, circuit_name, country_name = fetch_meeting_and_sessions(client, args.year, round_id)
            for s in sessions:
                code = get_session_code(s)
                if target_session_code != "all" and code != target_session_code:
                    continue

                session_base = f"f1_{args.year}_rd{round_id}_{code}"
                if session_base in processed_sessions and not args.force:
                    print(f"Skipping {session_base}: already in metadata.json")
                    continue

                # Ensure session has actually started
                s_start = datetime.fromisoformat(s.get("date_start").replace("Z", "+00:00"))
                if s_start > now_utc and not args.force:
                    print(f"Skipping {session_base}: session has not started yet ({s_start})")
                    continue

                ingest_session(
                    client=client,
                    year=args.year,
                    round_id=round_id,
                    session_obj=s,
                    race_name=race_name,
                    circuit_name=circuit_name,
                    country_name=country_name,
                    output_dir=args.output_dir
                )
        except Exception as e:
            print(f"Error checking/ingesting Round {round_id}: {e}")


if __name__ == "__main__":
    main()
