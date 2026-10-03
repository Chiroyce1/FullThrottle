import argparse
import json
import os
import unicodedata
from pathlib import Path

import fastf1
import pandas as pd


def setup_cache():
    fastf1.Cache._default_cache_enabled = True
    fastf1.Cache.set_disabled()


# Canonical filenames. Keep in sync with LOCATION_OVERRIDES in
# src/lib/track-corners.ts. FastF1 changes location names year to year
# ("Monaco" vs "Monte Carlo"), so both map to one file.
CANONICAL_OVERRIDES = {
    "miami gardens": "miami",
    "bahrain": "sakhir",
    "monte carlo": "monaco",
    "kuala lumpur": "sepang",
}


def sanitize_filename(name: str) -> str:
    # Fold accents to ASCII so filenames stay URL-safe
    # ("Montréal" -> "montreal", "São Paulo" -> "sao_paulo").
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    lowered = ascii_name.strip().lower()
    if lowered in CANONICAL_OVERRIDES:
        return CANONICAL_OVERRIDES[lowered]
    # Strip special characters and normalize spaces to underscores.
    safe_chars = [c for c in lowered if c.isalpha() or c.isdigit() or c == ' ']
    return "".join(safe_chars).rstrip().replace(" ", "_")


def fetch_circuit_data(year: int, round_number: int):
    # Qualifying is smaller to download than the race.
    # We fall back to Practice 1 if the weekend just started and Qualifying hasn't happened.
    try:
        session = fastf1.get_session(year, round_number, 'Q')
        session.load(telemetry=True, laps=True, weather=False)
        return session.get_circuit_info()
    except Exception as q_err:
        print(f"  -> Qualifying failed ({q_err}). Trying Practice 1.")
        session = fastf1.get_session(year, round_number, 'FP1')
        session.load(telemetry=True, laps=True, weather=False)
        return session.get_circuit_info()


def parse_nodes(dataframe, fields: dict) -> list[dict]:
    # Convert FastF1 pandas rows into plain Python dictionaries.
    if dataframe is None or not hasattr(dataframe, 'iterrows'):
        return []

    nodes = []
    for _, row in dataframe.iterrows():
        node = {}
        for key, default_val in fields.items():
            val = row.get(key.capitalize())
            
            if pd.isna(val):
                node[key] = default_val
            elif default_val is None:
                # Number fields in FastF1 can be null, so we default them to None.
                # If they have a value, they are integers.
                node[key] = int(val)
            else:
                # Match the type of the default value.
                node[key] = type(default_val)(val)
                
        nodes.append(node)
    
    return nodes


def extract_track_info(year: int, output_dir: Path):
    setup_cache()
    
    events = fastf1.get_event_schedule(year)
    output_dir.mkdir(parents=True, exist_ok=True)

    now = pd.Timestamp.utcnow()
    extracted = set()

    for _, event in events.iterrows():
        if event['EventFormat'] == 'testing':
            continue

        # Skip events that haven't happened yet. FastF1 has no session data for them.
        event_date = event.get('EventDate')
        if pd.notna(event_date):
            ts = pd.Timestamp(event_date)
            if ts.tzinfo is None:
                ts = ts.tz_localize('UTC')
            if ts > now:
                print(f"Skipping {event.get('EventName')} (future event, {ts.date()})")
                continue

        circuit_key = event.get('Location', event.get('EventName'))
        if not isinstance(circuit_key, str):
            continue
            
        filename = sanitize_filename(circuit_key)
        
        if filename in extracted:
            continue

        out_file = output_dir / f"{filename}.json"
        if out_file.exists():
            print(f"Skipping {circuit_key} ({out_file.name} already exists).")
            extracted.add(filename)
            continue

            
        print(f"Extracting track info for {circuit_key}...")
        try:
            circuit_info = fetch_circuit_data(year, event['RoundNumber'])
            
            # Rotation applies to the entire map SVG to align it North.
            rotation = float(circuit_info.rotation) if hasattr(circuit_info, 'rotation') else 0.0
            
            track_data = {
                "name": circuit_key,
                "country": event.get('Country', ''),
                "rotation": rotation,
                "corners": parse_nodes(getattr(circuit_info, 'corners', None), {
                    "number": None,
                    "letter": "",
                    "angle": 0.0,
                    "distance": 0.0,
                    "x": 0.0,
                    "y": 0.0
                }),
                "marshal_sectors": parse_nodes(getattr(circuit_info, 'marshal_sectors', None), {
                    "number": None,
                    "distance": 0.0,
                    "x": 0.0,
                    "y": 0.0
                }),
                "marshal_lights": parse_nodes(getattr(circuit_info, 'marshal_lights', None), {
                    "number": None,
                    "distance": 0.0,
                    "x": 0.0,
                    "y": 0.0
                })
            }

            out_file = output_dir / f"{filename}.json"
            with open(out_file, 'w') as f:
                json.dump(track_data, f, indent=4)
                
            extracted.add(filename)
            print(f"  -> Saved to {out_file}")
            
        except Exception as e:
            print(f"  -> Failed to extract info for {circuit_key}. Reason: {e}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract FastF1 track coordinate data.')
    parser.add_argument('--year', type=int, default=2026, help='The championship year.')
    parser.add_argument('--output-dir', type=str, default='static/tracks', help='Where to save the JSON files.')
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent.parent
    target_dir = Path(args.output_dir)
    
    # Resolve relative paths against the project root.
    if not target_dir.is_absolute():
        target_dir = project_dir / target_dir

    extract_track_info(args.year, target_dir)
