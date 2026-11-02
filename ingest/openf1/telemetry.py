"""
Driver telemetry synchronization, outer-join merge (~8Hz), and metric calculations.
"""

from datetime import datetime
import numpy as np
import pandas as pd
from .constants import OPENF1_BASE
from .client import OpenF1Client


def build_track_status_timeline(race_control_raw: list, session_start: datetime) -> pd.DataFrame:
    """
    Reconstructs continuous TrackStatus timeline from OpenF1 race_control messages.
    TrackStatus standard codes:
      1 = All Clear / Green
      2 = Yellow Flag
      4 = Safety Car (SC)
      5 = Red Flag
      6 = Virtual Safety Car (VSC) Deployed
      7 = Virtual Safety Car (VSC) Ending
    """
    if not race_control_raw:
        return pd.DataFrame()

    df = pd.DataFrame(race_control_raw)
    if "date" not in df.columns:
        return pd.DataFrame()

    df["date"] = pd.to_datetime(df["date"], format="ISO8601")
    df = df.sort_values("date")

    initial_date = session_start - pd.Timedelta(minutes=30)
    current_status = 1
    timeline = [{"date": initial_date, "track_status": 1}]

    for _, r in df.iterrows():
        msg = str(r.get("message") or "").upper()
        cat = str(r.get("category") or "")
        flag = str(r.get("flag") or "").upper()
        scope = str(r.get("scope") or "")

        new_status = None
        # Red Flag (careful: 'CHEQUERED' contains 'RED' as a substring)
        if ("RED FLAG" in msg or flag == "RED") and "CHEQUERED" not in msg and "RED LIGHT" not in msg:
            new_status = 5
        elif "SAFETY CAR DEPLOYED" in msg or (cat == "SafetyCar" and "DEPLOYED" in msg and "VSC" not in msg):
            new_status = 4
        elif "VSC DEPLOYED" in msg or "VIRTUAL SAFETY CAR DEPLOYED" in msg:
            new_status = 6
        elif "VSC ENDING" in msg:
            new_status = 7
        elif current_status == 5:
            # While in red flag, track only resumes on session restart
            if "SESSION STARTED" in msg or "GREEN LIGHT" in msg or "STANDING START" in msg or "OVERTAKE ENABLED" in msg:
                new_status = 4 if "SAFETY CAR" in msg else 1
        elif current_status in [4, 6, 7]:
            # Exiting SC / VSC
            if "TRACK CLEAR" in msg or ("CLEAR" in msg and scope == "Track") or "OVERTAKE ENABLED" in msg or "GREEN LIGHT" in msg:
                new_status = 1
        elif "TRACK CLEAR" in msg or ("CLEAR" in msg and scope == "Track"):
            new_status = 1
        elif flag == "YELLOW" and scope == "Track":
            new_status = 2

        if new_status is not None and new_status != current_status:
            current_status = new_status
            timeline.append({"date": r["date"], "track_status": current_status})

    return pd.DataFrame(timeline).sort_values("date")


def build_driver_telemetry(
    client: OpenF1Client,
    session_key: int,
    driver: dict,
    session_start: datetime,
    laps_df: pd.DataFrame,
    stints_df: pd.DataFrame,
    intervals_df: pd.DataFrame,
    pos_df: pd.DataFrame,
    track_status_df: pd.DataFrame = None
) -> pd.DataFrame:
    """
    Fetches car_data and location for a single driver, performs FastF1-equivalent
    outer merge (~8Hz effective sampling) and linear interpolation.
    """
    driver_num = int(driver["driver_number"])

    # 1. Fetch car data (speed, rpm, gear, throttle, brake, drs)
    car_raw = client.get(
        f"{OPENF1_BASE}/car_data",
        params={"session_key": session_key, "driver_number": driver_num}
    )
    if not car_raw:
        return None

    # 2. Fetch location data (x, y, z)
    loc_raw = client.get(
        f"{OPENF1_BASE}/location",
        params={"session_key": session_key, "driver_number": driver_num}
    )
    if not loc_raw:
        return None

    df_car = pd.DataFrame(car_raw)
    df_loc = pd.DataFrame(loc_raw)

    df_car["date"] = pd.to_datetime(df_car["date"], format="ISO8601")
    df_loc["date"] = pd.to_datetime(df_loc["date"], format="ISO8601")

    # Drop any duplicate timestamps within each feed before merging
    df_car = df_car.drop_duplicates(subset=["date"], keep="last")
    df_loc = df_loc.drop_duplicates(subset=["date"], keep="last")

    # Outer join on timestamp: keep all telemetry & position timestamps
    merged = pd.merge(
        df_loc.set_index("date")[["x", "y", "z"]],
        df_car.set_index("date")[["speed", "rpm", "n_gear", "throttle", "brake", "drs"]],
        how="outer",
        left_index=True,
        right_index=True
    ).sort_index()

    # Time-weighted interpolation: interpolates proportionally to elapsed milliseconds,
    # avoiding step-function artifacts when location & car packets arrive asynchronously.
    merged["speed"] = merged["speed"].interpolate(method="time").bfill().ffill()
    merged["rpm"] = merged["rpm"].interpolate(method="time").bfill().ffill()
    merged["throttle"] = merged["throttle"].interpolate(method="time").bfill().ffill()
    merged["x"] = merged["x"].interpolate(method="time").bfill().ffill()
    merged["y"] = merged["y"].interpolate(method="time").bfill().ffill()
    merged["z"] = merged["z"].interpolate(method="time").bfill().ffill()

    # Discrete variables: forward fill then backward fill
    merged["n_gear"] = pd.to_numeric(merged["n_gear"].ffill().bfill(), errors="coerce").fillna(0).astype(int)
    merged["brake"] = (pd.to_numeric(merged["brake"].ffill().bfill(), errors="coerce").fillna(0) > 0)
    merged["drs"] = pd.to_numeric(merged["drs"].ffill().bfill(), errors="coerce").fillna(0).astype(int)

    df_merged = merged.reset_index().dropna(subset=["date"])

    # Calculate session_time in seconds from session_start
    df_merged["session_time"] = (df_merged["date"] - session_start).dt.total_seconds().astype(np.float32)

    # Filter out data before session start or extreme outliers
    df_merged = df_merged[df_merged["session_time"] >= -1800].copy()

    # Calculate cumulative distance: speed is km/h -> m/s is / 3.6
    dt = df_merged["date"].diff().dt.total_seconds().fillna(0.0).clip(lower=0.0, upper=10.0)
    speed_ms = df_merged["speed"] / 3.6
    df_merged["distance"] = (speed_ms * dt).cumsum().astype(np.float32)

    df_merged["driver_number"] = driver_num

    # Merge Laps data (LapNumber, Stint, Compound, TyreLife)
    drv_laps = laps_df[laps_df["driver_number"] == driver_num].copy() if not laps_df.empty else pd.DataFrame()
    if not drv_laps.empty:
        drv_laps["date_start"] = pd.to_datetime(drv_laps["date_start"], format="ISO8601")
        drv_laps = drv_laps.dropna(subset=["date_start"]).sort_values("date_start")

        # Map tyre compound & life from stints
        drv_stints = stints_df[stints_df["driver_number"] == driver_num].copy() if not stints_df.empty else pd.DataFrame()

        stint_col = []
        compound_col = []
        tyre_life_col = []

        for _, lrow in drv_laps.iterrows():
            lnum = int(lrow["lap_number"])
            stint_num = 1
            compound = "UNKNOWN"
            tyre_life = lnum
            if not drv_stints.empty:
                match_stint = drv_stints[(drv_stints["lap_start"] <= lnum) & (drv_stints["lap_end"] >= lnum)]
                if not match_stint.empty:
                    s = match_stint.iloc[0]
                    stint_num = int(s.get("stint_number", 1))
                    compound = str(s.get("compound", "UNKNOWN")).upper()
                    age_at_start = int(s.get("tyre_age_at_start", 0) or 0)
                    tyre_life = age_at_start + (lnum - int(s.get("lap_start", 1))) + 1

            stint_col.append(stint_num)
            compound_col.append(compound)
            tyre_life_col.append(tyre_life)

        drv_laps["stint"] = stint_col
        drv_laps["compound"] = compound_col
        drv_laps["tyre_life"] = tyre_life_col

        # Merge backwards onto telemetry dates
        merge_laps = drv_laps[["date_start", "lap_number", "stint", "compound", "tyre_life"]].rename(
            columns={"date_start": "date"}
        ).dropna(subset=["date"])

        if not merge_laps.empty:
            df_merged = pd.merge_asof(
                df_merged.sort_values("date"),
                merge_laps.sort_values("date"),
                on="date",
                direction="backward"
            )
        else:
            df_merged["lap_number"] = 1
            df_merged["stint"] = 1
            df_merged["compound"] = "UNKNOWN"
            df_merged["tyre_life"] = 1
    else:
        df_merged["lap_number"] = 1
        df_merged["stint"] = 1
        df_merged["compound"] = "UNKNOWN"
        df_merged["tyre_life"] = 1

    df_merged["lap_number"] = df_merged["lap_number"].fillna(1).astype(int)
    df_merged["stint"] = df_merged["stint"].fillna(1).astype(int)
    df_merged["compound"] = df_merged["compound"].fillna("UNKNOWN").astype(str)
    df_merged["tyre_life"] = df_merged["tyre_life"].fillna(1).astype(int)

    # Merge Position history
    drv_pos = pos_df[pos_df["driver_number"] == driver_num].copy() if not pos_df.empty else pd.DataFrame()
    if not drv_pos.empty:
        drv_pos["date"] = pd.to_datetime(drv_pos["date"], format="ISO8601")
        drv_pos = drv_pos.dropna(subset=["date"]).sort_values("date")
        if not drv_pos.empty:
            df_merged = pd.merge_asof(
                df_merged.sort_values("date"),
                drv_pos[["date", "position"]],
                on="date",
                direction="backward"
            )
        else:
            df_merged["position"] = 1
    else:
        df_merged["position"] = 1
    df_merged["position"] = df_merged["position"].fillna(1).astype(int)

    # Merge Intervals (gap / time_gap)
    drv_intervals = intervals_df[intervals_df["driver_number"] == driver_num].copy() if not intervals_df.empty else pd.DataFrame()
    if not drv_intervals.empty:
        drv_intervals["date"] = pd.to_datetime(drv_intervals["date"], format="ISO8601")
        drv_intervals["time_gap"] = drv_intervals["interval"].fillna(0.0)
        drv_intervals = drv_intervals.dropna(subset=["date"]).sort_values("date")
        if not drv_intervals.empty:
            df_merged = pd.merge_asof(
                df_merged.sort_values("date"),
                drv_intervals[["date", "time_gap"]],
                on="date",
                direction="backward"
            )
        else:
            df_merged["time_gap"] = 0.0
    else:
        df_merged["time_gap"] = 0.0
    df_merged["time_gap"] = df_merged["time_gap"].fillna(0.0).astype(np.float32)

    # Calculate distance_to_driver_ahead = time_gap * (speed / 3.6)
    df_merged["distance_to_driver_ahead"] = (df_merged["time_gap"] * (df_merged["speed"] / 3.6)).clip(lower=0.0).astype(np.float32)

    # Merge TrackStatus timeline
    if track_status_df is not None and not track_status_df.empty:
        df_merged = pd.merge_asof(
            df_merged.sort_values("date"),
            track_status_df[["date", "track_status"]].sort_values("date"),
            on="date",
            direction="backward"
        )
        df_merged["track_status"] = pd.to_numeric(df_merged["track_status"].fillna(1), errors="coerce").astype(np.uint8)
    else:
        df_merged["track_status"] = np.uint8(1)

    return df_merged
