"""
Metadata formatting and JSON sidecar compilation matching FastF1 core.py structure.
"""

from datetime import datetime
import pandas as pd


def build_driver_metadata(
    dnum: int,
    dinfo: dict,
    laps_df: pd.DataFrame,
    stints_df: pd.DataFrame,
    pos_df: pd.DataFrame,
    results_by_num: dict,
    session_start: datetime
) -> dict:
    """Compile driver profile, valid laps with sectors, and pit stop events."""
    res_entry = results_by_num.get(dnum, {})
    final_pos = -1
    grid_pos = 0

    if res_entry:
        try:
            final_pos = int(res_entry.get("position", -1))
            grid_pos = int(res_entry.get("grid", 0))
        except Exception:
            pass
    elif not pos_df.empty:
        d_pos = pos_df[pos_df["driver_number"] == dnum]
        if not d_pos.empty:
            final_pos = int(d_pos.iloc[-1].get("position", -1))

    # Build valid_laps list for this driver
    valid_laps_data = []
    pit_stops = []

    if not laps_df.empty:
        dlaps = laps_df[laps_df["driver_number"] == dnum].sort_values("lap_number")
        min_lap_duration = dlaps["lap_duration"].dropna().min() if not dlaps.empty else None

        for _, lrow in dlaps.iterrows():
            ldur = lrow.get("lap_duration")
            if ldur is None or pd.isna(ldur):
                continue

            lnum = int(lrow["lap_number"])
            s1 = float(lrow["duration_sector_1"]) if pd.notna(lrow.get("duration_sector_1")) else None
            s2 = float(lrow["duration_sector_2"]) if pd.notna(lrow.get("duration_sector_2")) else None
            s3 = float(lrow["duration_sector_3"]) if pd.notna(lrow.get("duration_sector_3")) else None

            # Find compound & tyre life for this lap
            cmpd = "UNKNOWN"
            tlife = lnum
            if not stints_df.empty:
                dst = stints_df[
                    (stints_df["driver_number"] == dnum) &
                    (stints_df["lap_start"] <= lnum) &
                    (stints_df["lap_end"] >= lnum)
                ]
                if not dst.empty:
                    s_row = dst.iloc[0]
                    cmpd = str(s_row.get("compound", "UNKNOWN")).upper()
                    age_at_start = int(s_row.get("tyre_age_at_start", 0) or 0)
                    tlife = age_at_start + (lnum - int(s_row.get("lap_start", 1))) + 1

            # Lap start time in seconds relative to session start
            lap_start_sec = None
            if pd.notna(lrow.get("date_start")):
                try:
                    lstart_dt = pd.to_datetime(lrow["date_start"], format="ISO8601")
                    lap_start_sec = round((lstart_dt - session_start).total_seconds(), 3)
                except Exception:
                    pass

            is_pb = bool(ldur == min_lap_duration) if min_lap_duration else False

            valid_laps_data.append({
                "lap_number": lnum,
                "lap_time": round(float(ldur), 3),
                "sector1": round(s1, 3) if s1 else None,
                "sector2": round(s2, 3) if s2 else None,
                "sector3": round(s3, 3) if s3 else None,
                "compound": cmpd,
                "tyre_life": tlife,
                "is_personal_best": is_pb,
                "lap_start_time": lap_start_sec
            })

            if lrow.get("is_pit_out_lap"):
                pit_stops.append({
                    "lap": lnum,
                    "compound_after": cmpd
                })

    team_color = dinfo.get("team_colour")
    color_str = f"#{team_color}" if team_color else None

    return {
        "driver_number": dnum,
        "name": dinfo.get("full_name") or dinfo.get("broadcast_name"),
        "first_name": dinfo.get("first_name"),
        "last_name": dinfo.get("last_name"),
        "abbreviation": dinfo.get("name_acronym"),
        "broadcast_name": dinfo.get("broadcast_name"),
        "team": dinfo.get("team_name"),
        "team_id": (dinfo.get("team_name") or "").lower().replace(" ", "_"),
        "color": color_str,
        "country_code": dinfo.get("country_code"),
        "headshot_url": dinfo.get("headshot_url"),
        "grid": grid_pos,
        "pos": final_pos,
        "pit_stops": pit_stops,
        "valid_laps": valid_laps_data
    }


def build_weather_metadata(weather_raw: list, session_start: datetime) -> tuple:
    """Returns (weather_summary, weather_series)."""
    weather_series = {}
    weather_summary = {}

    if not weather_raw:
        return weather_summary, weather_series

    w_df = pd.DataFrame(weather_raw)
    w_df["date"] = pd.to_datetime(w_df["date"], format="ISO8601")
    w_df["t"] = (w_df["date"] - session_start).dt.total_seconds().astype(int)

    weather_series = {
        "t": w_df["t"].tolist(),
        "air_temp": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("air_temperature", [])],
        "track_temp": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("track_temperature", [])],
        "humidity": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("humidity", [])],
        "pressure": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("pressure", [])],
        "wind_speed": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("wind_speed", [])],
        "wind_direction": [round(float(v), 1) if pd.notna(v) else None for v in w_df.get("wind_direction", [])],
        "rainfall": [bool(v > 0) if pd.notna(v) else False for v in w_df.get("rainfall", [])]
    }
    weather_summary = {
        "air_temp": round(float(w_df["air_temperature"].mean()), 1) if "air_temperature" in w_df else None,
        "track_temp": round(float(w_df["track_temperature"].mean()), 1) if "track_temperature" in w_df else None,
        "humidity": round(float(w_df["humidity"].mean()), 1) if "humidity" in w_df else None,
        "wind_speed": round(float(w_df["wind_speed"].mean()), 1) if "wind_speed" in w_df else None,
        "rainfall": bool((w_df.get("rainfall", pd.Series([0])) > 0).any())
    }

    return weather_summary, weather_series


def build_classification(jolpica_results: list) -> list:
    """Format Jolpica Ergast race results classification."""
    classification = []
    for res in jolpica_results:
        d_id = str(res.get("number"))
        gap = res.get("Time", {}).get("time") if "Time" in res else res.get("status")
        fl = res.get("FastestLap", {})
        classification.append({
            "driver": d_id,
            "position": str(res.get("position")),
            "points": float(res.get("points", 0.0)),
            "status": str(res.get("status")),
            "gap_to_leader": str(gap) if gap else None,
            "laps": int(res.get("laps", 0)),
            "fastest_lap_time": fl.get("Time", {}).get("time") if fl else None,
            "fastest_lap_number": int(fl.get("lap", 0)) if fl and fl.get("lap") else None
        })
    return classification
