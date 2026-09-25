"""Results enrichment: full classification, quali phases, and pit stops.
Answers "who won" for every session type uniformly, since practice
classification is fastest-lap order and quali order is position order.
Also stores what older ingests dropped: points, DNF status, gaps,
fastest laps, and per-driver pit stops from lap data.
"""
def _seconds(td):
    try:
        import pandas as pd
        if td is None or pd.isna(td):
            return None
        return round(float(td.total_seconds()), 3)
    except Exception:
        return None
def _safe_str(value):
    try:
        if value is None:
            return None
        s = str(value)
        return s if s.lower() not in ("nan", "none", "") else None
    except Exception:
        return None
def _safe_int(value):
    try:
        import pandas as pd
        if value is None or pd.isna(value):
            return None
        return int(value)
    except Exception:
        return None

def _safe_float(value, default=0.0):
    try:
        import pandas as pd
        if value is None or pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default

def add_results(session, meta: dict) -> None:
    drivers = meta.get("drivers", {})
    # Full classification table from session results.
    classification = []
    try:
        results = session.results
        if results is not None:
            for _, res in results.iterrows():
                try:
                    drv = str(int(res["DriverNumber"]))
                except Exception:
                    continue
                gap = res.get("GapToLeader") if hasattr(res, "get") else None
                classification.append(
                    {
                        "driver": drv,
                        "position": _safe_str(res.get("Position")) if hasattr(res, "get") else None,
                        "points": _safe_float(res.get("Points") if hasattr(res, "get") else None, 0.0),
                        "status": _safe_str(res.get("Status")) if hasattr(res, "get") else None,
                        "gap_to_leader": _safe_str(gap),
                        "laps": _safe_int(res.get("Laps") if hasattr(res, "get") else None),
                        "fastest_lap_time": _seconds(res.get("FastestLapTime")) if hasattr(res, "get") else None,
                        "fastest_lap_number": _safe_int(res.get("FastestLapLaps") if hasattr(res, "get") else None),
                    }
                )
    except Exception as err:
        print(f"Warning: could not extract classification: {err}")
    if classification:
        meta["session_results"] = classification
    # Qualifying phases for Q and SQ sessions.
    session_code = (meta.get("session_info", {}).get("session_code") or "").lower()
    if session_code in ("q", "sq"):
        try:
            quali_data = {}
            results = session.results
            if results is not None:
                for _, res in results.iterrows():
                    try:
                        drv = str(int(res["DriverNumber"]))
                    except Exception:
                        continue
                    entry = {}
                    for phase in ["Q1", "Q2", "Q3"]:
                        t = res.get(phase) if hasattr(res, "get") else None
                        entry[phase.lower()] = _seconds(t)
                    quali_data[drv] = entry
            if quali_data:
                meta["qualifying"] = quali_data
        except Exception as err:
            print(f"Warning: could not extract qualifying phases: {err}")
    # Pit stops per driver from lap data.
    try:
        laps = session.laps
        pit_stops = {}
        if laps is not None and not laps.empty and "PitInTime" in laps.columns:
            for driver_id in session.drivers:
                drv = str(driver_id)
                dlap = laps.pick_drivers([driver_id])
                stops = []
                for _, lap in dlap.iterrows():
                    if lap.get("PitInTime") is None:
                        continue
                    try:
                        import pandas as pd
                        if pd.isna(lap["PitInTime"]):
                            continue
                    except Exception:
                        continue
                    stops.append(
                        {
                            "lap": int(lap["LapNumber"]) if lap.get("LapNumber") is not None else None,
                            "compound_after": _safe_str(lap.get("Compound")),
                        }
                    )
                if stops:
                    pit_stops[drv] = stops
        # Stored per driver next to valid_laps so the UI reads one place.
        for drv, stops in pit_stops.items():
            if drv in drivers and stops:
                drivers[drv]["pit_stops"] = stops
    except Exception as err:
        print(f"Warning: could not extract pit stops: {err}")