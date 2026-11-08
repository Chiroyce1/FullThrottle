"""Builds monaco-race.json.gz: real 2026 Monaco race laps for the track-outline tests.

Only the early laps of that race carry real positions: from about lap 6
the winner's position drifts along a straight line kilometres long while
speed and timing stay normal, and from about lap 43 every position is
(0, 0). By lap 35 no driver has real positions. The fixture holds the
winner's laps 10-12 (drifting) and 46 (all zero) as corrupt, laps 2-4 as
clean, and the qualifying outline's bounding box as the reference.

Usage (from the repo root):
  uv run --no-project --with numpy --with pandas --with pyarrow \\
    python tests/fixtures/track-path/build.py
"""
import gzip
import json
import os

import pandas as pd

OUT = os.path.join(os.path.dirname(__file__), "monaco-race.json.gz")
COLS = ["driver_number", "lap_number", "session_time", "x", "y"]

race = pd.read_parquet("static/data/2026/f1_2026_rd6_r.parquet", columns=COLS)
meta = json.load(open("static/data/2026/f1_2026_rd6_r.json"))
winner = next(d for d in meta["drivers"].values() if d["pos"] == 1)["driver_number"]

def laps(numbers):
    rows = race[(race.driver_number.astype(int) == int(winner)) & race.lap_number.isin(numbers)]
    rows = rows.sort_values("session_time")
    return {c: [round(float(v), 3) for v in rows[c]] for c in COLS}

quali = pd.read_parquet("static/data/2026/f1_2026_rd6_q.parquet", columns=["x", "y"])
quali = quali[~((quali.x == 0) & (quali.y == 0))]

fixture = {
    "winner": str(winner),
    "corrupt": laps([10, 11, 12, 46]),
    "clean": laps([2, 3, 4]),
    "qualifyingBox": [float(quali.x.min()), float(quali.x.max()), float(quali.y.min()), float(quali.y.max())],
}
with gzip.open(OUT, "wt") as f:
    json.dump(fixture, f, separators=(",", ":"))
print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")
