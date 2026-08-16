"""
Core data processing script for the F1 telemetry pipeline.
This script utilizes the FastF1 library to extract telemetry, lap, and session
data for a given Formula 1 session. It enriches the data with driver information,
track status, and qualifying results, performing data aggregation and type
casting to optimize the final file size. The output is a compressed Parquet
file for the telemetry dataframe and a JSON file containing session metadata.
"""

import fastf1
import pandas as pd
import json
import os

# -----------------------
# Removed static constants, function now accepts parameters

SESSION_MAP = {
    'Practice 1': 'FP1', 'Practice 2': 'FP2', 'Practice 3': 'FP3',
    'Sprint Qualifying': 'SQ', 'Qualifying': 'Q', 'Sprint': 'S', 'Race': 'R',
    'FP1': 'FP1', 'FP2': 'FP2', 'FP3': 'FP3', 'Quali': 'Q', 'SQ': 'SQ'
}

ESSENTIAL_COLUMNS = [
    'SessionTime', 'Distance', 'Speed', 'RPM', 'nGear',
    'Throttle', 'Brake', 'DRS', 'X', 'Y', 'Z',
    'DriverNumber', 'DistanceToDriverAhead', 'TimeGap',
    'LapNumber', 'Stint', 'Compound', 'TyreLife', 'TrackStatus', 'Position'
]


def archive_data(year, r_type, round_id, session_id, day=1, output_dirs=None):
    fastf1.Cache._default_cache_enabled = True
    fastf1.Cache.set_disabled()
    # 1. Load Session
    if r_type == 'TESTING':
        session = fastf1.get_testing_session(year, round_id, day)
    else:
        session = fastf1.get_session(year, round_id, session_id)

    session.load(telemetry=True, laps=True)

    # Track Status is global - fix index immediately
    track_status_source = session.track_status
    if track_status_source is not None:
        track_status_data = track_status_source.copy().reset_index()
    else:
        track_status_data = pd.DataFrame(
            columns=['SessionTime', 'TrackStatus'])
    if 'Time' in track_status_data.columns:
        track_status_data = track_status_data.rename(
            columns={'Time': 'SessionTime', 'Status': 'TrackStatus'})

    all_drivers_telemetry = []

    # Build rich session_info block
    event = session.event

    def _safe_str(val):
        try:
            return str(val) if val and str(val).lower() not in ('nan', 'none', '') else None
        except Exception:
            return None

    if r_type == 'TESTING':
        session_info = {
            "name": event['EventName'],
            "type": "TESTING",
            "test_number": round_id,
            "day": day,
            "year": int(event['EventDate'].year) if hasattr(event['EventDate'], 'year') else None,
            "country": _safe_str(event.get('Country')),
            "location": _safe_str(event.get('Location')),
            "circuit": _safe_str(event.get('OfficialEventName') or event.get('EventName')),
            "date": str(event['EventDate'].date()) if hasattr(event['EventDate'], 'date') else None,
        }
    else:
        session_info = {
            "name": event['EventName'],
            "type": r_type,
            "round": int(round_id),
            "year": int(event['EventDate'].year) if hasattr(event['EventDate'], 'year') else None,
            "country": _safe_str(event.get('Country')),
            "location": _safe_str(event.get('Location')),
            "circuit": _safe_str(event.get('OfficialEventName') or event.get('EventName')),
            "date": str(event['EventDate'].date()) if hasattr(event['EventDate'], 'date') else None,
            "session_name": session_id,
            "session_code": session_id.lower(),
        }
    metadata = {"session_info": session_info, "drivers": {}}

    for driver_id in session.drivers:
        print(f"Processing driver {driver_id}...", end="\r")
        try:
            driver_laps = session.laps.pick_drivers(driver_id)
            if driver_laps.empty:
                continue

            # Fetch Telemetry and immediately reset index to move SessionTime to a column
            telemetry_data = driver_laps.get_telemetry().reset_index()

            # Fix naming inconsistency if 'Time' appears instead of 'SessionTime'
            if 'SessionTime' not in telemetry_data.columns and 'Time' in telemetry_data.columns:
                telemetry_data = telemetry_data.rename(
                    columns={'Time': 'SessionTime'})

            # Add Driver Ahead data
            telemetry_data = telemetry_data.add_driver_ahead()

            # Merge Lap-level data (Tyres, LapNumber, Position)
            laps_subset = driver_laps[[
                'LapNumber', 'Stint', 'Compound', 'TyreLife', 'Position', 'LapStartTime']].copy()
            laps_subset = laps_subset.rename(
                columns={'LapStartTime': 'SessionTime'})
            telemetry_data = pd.merge_asof(
                telemetry_data.sort_values('SessionTime'),
                laps_subset.dropna(
                    subset=['SessionTime']).sort_values('SessionTime'),
                on='SessionTime',
                direction='backward'
            )

            # Merge Track Status
            telemetry_data = pd.merge_asof(
                telemetry_data,
                track_status_data[['SessionTime', 'TrackStatus']],
                on='SessionTime',
                direction='backward'
            )

            # Calculations
            speed_ms = (telemetry_data['Speed'] / 3.6).clip(lower=0.1)
            telemetry_data['TimeGap'] = (
                telemetry_data['DistanceToDriverAhead'] / speed_ms).fillna(0)
            telemetry_data['DriverNumber'] = int(driver_id)

            all_drivers_telemetry.append(telemetry_data)

            # Metadata for the UI
            driver_info = session.get_driver(driver_id)

            def _safe_int(val, default=0):
                try:
                    return int(float(val))
                except (ValueError, TypeError):
                    return default

            def _safe_field(info, key):
                try:
                    v = info[key]
                    return str(v) if v and str(v).lower() not in ('nan', 'none', '') else None
                except Exception:
                    return None

            grid_position = _safe_int(driver_info.get('GridPosition'), 0)
            classified_position = _safe_int(
                driver_info.get('ClassifiedPosition'), -1)

            # Build headshot URL - fastf1 exposes HeadshotUrl directly
            headshot_url = _safe_field(driver_info, 'HeadshotUrl')

            # Extract accurate lap information
            valid_laps_data = []
            if not driver_laps.empty:
                valid_laps = driver_laps.pick_accurate()
                for _, lap in valid_laps.iterrows():
                    lap_dict = {
                        "lap_number": int(lap['LapNumber']) if pd.notna(lap['LapNumber']) else None,
                        "lap_time": lap['LapTime'].total_seconds() if pd.notna(lap['LapTime']) else None,
                        "sector1": lap['Sector1Time'].total_seconds() if pd.notna(lap['Sector1Time']) else None,
                        "sector2": lap['Sector2Time'].total_seconds() if pd.notna(lap['Sector2Time']) else None,
                        "sector3": lap['Sector3Time'].total_seconds() if pd.notna(lap['Sector3Time']) else None,
                        "compound": str(lap['Compound']) if pd.notna(lap['Compound']) else None,
                        "tyre_life": int(lap['TyreLife']) if pd.notna(lap['TyreLife']) else None,
                        "is_personal_best": bool(lap['IsPersonalBest']) if pd.notna(lap['IsPersonalBest']) else False
                    }
                    valid_laps_data.append(lap_dict)

            metadata["drivers"][str(driver_id)] = {
                "driver_number": int(driver_id),
                "name": _safe_field(driver_info, 'FullName'),
                "first_name": _safe_field(driver_info, 'FirstName'),
                "last_name": _safe_field(driver_info, 'LastName'),
                "abbreviation": _safe_field(driver_info, 'Abbreviation'),
                "broadcast_name": _safe_field(driver_info, 'BroadcastName'),
                "team": _safe_field(driver_info, 'TeamName'),
                "team_id": _safe_field(driver_info, 'TeamId'),
                "color": f"#{driver_info['TeamColor']}" if _safe_field(driver_info, 'TeamColor') else None,
                "country_code": _safe_field(driver_info, 'CountryCode'),
                "headshot_url": headshot_url,
                "grid": grid_position,
                "pos": classified_position,
                "valid_laps": valid_laps_data,
            }
        except Exception as error:
            print(f"\nError with driver {driver_id}: {error}")

    try:
        results = session.results
        for _, res in results.iterrows():
            drv = str(int(res['DriverNumber']))
            if drv not in metadata['drivers']:
                continue

            try:
                metadata['drivers'][drv]['pos'] = int(float(res['Position']))
            except (ValueError, TypeError, KeyError):
                pass

            try:
                metadata['drivers'][drv]['grid'] = int(
                    float(res['GridPosition']))
            except (ValueError, TypeError, KeyError):
                pass
    except Exception as error:
        print(f"Warning: Could not enrich driver results metadata: {error}")

    # Extract qualifying phase results for Q/SQ sessions
    is_quali = session_id.upper() in ('Q', 'SQ')
    if is_quali:
        try:
            results = session.results
            quali_data = {}
            for _, res in results.iterrows():
                drv = str(int(res['DriverNumber']))
                entry = {}
                for phase in ['Q1', 'Q2', 'Q3']:
                    if phase in res and pd.notna(res[phase]):
                        entry[phase.lower()] = res[phase].total_seconds()
                    else:
                        entry[phase.lower()] = None
                quali_data[drv] = entry

                # Fix driver metadata with proper qualifying position from results
                if drv in metadata['drivers']:
                    try:
                        metadata['drivers'][drv]['pos'] = int(
                            float(res['Position']))
                    except (ValueError, TypeError):
                        pass
                    try:
                        metadata['drivers'][drv]['grid'] = int(
                            float(res['GridPosition']))
                    except (ValueError, TypeError):
                        metadata['drivers'][drv]['grid'] = 0

            metadata['qualifying'] = quali_data
            print(
                f"Extracted qualifying results for {len(quali_data)} drivers")
        except Exception as e:
            print(f"Warning: Could not extract qualifying results: {e}")

    # 2. Final Global Merge - keep full 8Hz data, no downsampling
    if not all_drivers_telemetry:
        raise RuntimeError(
            f"No telemetry rows found for {year} round {round_id} session {session_id}")

    master_dataframe = pd.concat(all_drivers_telemetry).reset_index(drop=True)

    # 3. Rounding & Type Casting (The Space Savers)
    type_map = {
        'Speed': 'uint16', 'RPM': 'uint16', 'nGear': 'uint8', 'Throttle': 'uint8',
        'Brake': 'bool', 'DRS': 'uint8', 'X': 'float32', 'Y': 'float32', 'Z': 'float32',
        'Distance': 'float32', 'DistanceToDriverAhead': 'float32', 'TimeGap': 'float32',
        'LapNumber': 'uint8', 'Stint': 'uint8', 'TyreLife': 'uint8', 'TrackStatus': 'uint8',
        'Position': 'uint8'
    }

    master_dataframe['Compound'] = master_dataframe['Compound'].astype(
        'category')

    for col, dtype in type_map.items():
        if col in master_dataframe.columns:
            if dtype.startswith('uint'):
                master_dataframe[col] = pd.to_numeric(
                    master_dataframe[col], errors='coerce').round(0).fillna(0).astype(dtype)
            else:
                master_dataframe[col] = master_dataframe[col].astype(dtype)

    # Convert SessionTime to float seconds
    master_dataframe['SessionTime'] = master_dataframe['SessionTime'].dt.total_seconds(
    ).astype('float32')
    master_dataframe['DriverNumber'] = master_dataframe['DriverNumber'].astype(
        'uint8')

    # 4. Final Export
    folder_path = os.path.join("data", str(year))
    os.makedirs(folder_path, exist_ok=True)

    if r_type == 'TESTING':
        base_name = f"f1_{year}_test{round_id}_{session_id.lower()}"
    else:
        base_name = f"f1_{year}_rd{round_id}_{session_id.lower()}"
    final_dataframe = master_dataframe[[
        c for c in ESSENTIAL_COLUMNS if c in master_dataframe.columns]].copy()

    # Convert dataframe columns to snake_case for backend data output
    column_mapping = {
        'SessionTime': 'session_time',
        'Distance': 'distance',
        'Speed': 'speed',
        'RPM': 'rpm',
        'nGear': 'n_gear',
        'Throttle': 'throttle',
        'Brake': 'brake',
        'DRS': 'drs',
        'X': 'x',
        'Y': 'y',
        'Z': 'z',
        'DriverNumber': 'driver_number',
        'DistanceToDriverAhead': 'distance_to_driver_ahead',
        'TimeGap': 'time_gap',
        'LapNumber': 'lap_number',
        'Stint': 'stint',
        'Compound': 'compound',
        'TyreLife': 'tyre_life',
        'TrackStatus': 'track_status',
        'Position': 'position'
    }
    final_dataframe = final_dataframe.rename(columns=column_mapping)
    metadata['session_info']['totalLaps'] = int(final_dataframe['lap_number'].max(
    )) if 'lap_number' in final_dataframe.columns else None

    output_dirs = output_dirs or [folder_path]

    for output_dir in output_dirs:
        target_dir = output_dir if os.path.basename(output_dir) == str(
            year) else os.path.join(output_dir, str(year))
        os.makedirs(target_dir, exist_ok=True)

        parquet_path = os.path.join(target_dir, f"{base_name}.parquet")
        json_path = os.path.join(target_dir, f"{base_name}.json")

        final_dataframe.to_parquet(
            parquet_path, engine='pyarrow', compression='zstd')

        with open(json_path, "w") as file:
            json.dump(metadata, file, indent=4)

        print(f"\nExport success: {parquet_path} and .json generated.")


if __name__ == "__main__":
    archive_data(year=2025, r_type='RACE', round_id=1, session_id='RACE')
