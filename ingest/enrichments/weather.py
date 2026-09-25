"""Weather enrichment: full time series plus the averaged summary.
FastF1 gives weather_data timestamped through the whole session, about one
sample a minute. A two hour race is roughly 150 rows, so storing the series
costs around 20KB per file. Averaging it (as older ingests did) destroys the
signal analysts actually want, like track temp falling off at sunset.
"""
SERIES_COLUMNS = [
    "AirTemp",
    "TrackTemp",
    "Humidity",
    "Pressure",
    "WindSpeed",
    "WindDirection",
    "Rainfall",
]
def _round1(value):
    try:
        import pandas as pd
        if pd.isna(value):
            return None
        return round(float(value), 1)
    except Exception:
        return None
def add_weather(session, meta: dict) -> None:
    wx = session.weather_data
    if wx is None or wx.empty:
        return
    times = []
    cols = {c: [] for c in SERIES_COLUMNS}
    for ts, row in wx.iterrows():
        try:
            t = ts.total_seconds() if hasattr(ts, "total_seconds") else float(ts)
        except Exception:
            continue
        times.append(int(t))
        for c in SERIES_COLUMNS:
            v = row.get(c) if hasattr(row, "get") else None
            if c == "Rainfall":
                cols[c].append(bool(v) if v is not None else False)
            else:
                cols[c].append(_round1(v))
    if not times:
        return
    meta.setdefault("session_info", {})["weather_series"] = {
        "t": times,
        "air_temp": cols["AirTemp"],
        "track_temp": cols["TrackTemp"],
        "humidity": cols["Humidity"],
        "pressure": cols["Pressure"],
        "wind_speed": cols["WindSpeed"],
        "wind_direction": cols["WindDirection"],
        "rainfall": cols["Rainfall"],
    }
    def _avg(col):
        vals = [v for v in cols[col] if v is not None]
        return round(sum(vals) / len(vals), 1) if vals else None
    meta["session_info"]["weather"] = {
        "air_temp": _avg("AirTemp"),
        "track_temp": _avg("TrackTemp"),
        "humidity": _avg("Humidity"),
        "wind_speed": _avg("WindSpeed"),
        "rainfall": any(cols["Rainfall"]),
    }