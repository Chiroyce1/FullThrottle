"""Builds laps.json.gz: real race samples and independently computed lap labels.

The app relabels samples outside a driver's laps (src/lib/telemetry/race-laps.ts):
before lap 1's lap_start_time -> 0 (out-laps, grid, formation lap); in a race,
after the classified last lap ends (its lap_start_time + lap_time), or labelled
past it -> last lap + 1. Expected labels are computed here in numpy, separately
from the TypeScript.

Only real samples are kept: every sample within 5 s of a lap boundary or of
the finish, plus every 25th sample elsewhere, so the fixture stays small.

Usage (from the repo root):
  uv run --no-project --with numpy --with pandas --with pyarrow \
    python tests/fixtures/laps/build.py
"""
import gzip
import json
import os

import numpy as np
import pandas as pd

OUT = os.path.join(os.path.dirname(__file__), "laps.json.gz")
# session -> drivers (by abbreviation); "lapped" = first finisher a lap down.
PICKS = {
    "f1_2026_rd20_r": ["NOR", "VER", "lapped"],  # Brazil, OpenF1
    "f1_2026_rd18_r": ["NOR", "VER"],  # Austin, OpenF1
    "f1_2026_rd1_r": ["NOR"],  # Australia, FastF1: nothing outside its laps
}


def expected_labels(t, lap, valid, last):
    out = lap.copy()
    starts = {v["lap_number"]: v.get("lap_start_time") for v in valid}
    s1 = starts.get(1)
    finish = None
    if last is not None:
        f = next((v for v in valid if v["lap_number"] == last), None)
        if f and f.get("lap_start_time") is not None and f.get("lap_time") is not None:
            finish = f["lap_start_time"] + f["lap_time"]
    for i in range(len(t)):
        if s1 is not None and t[i] < s1:
            out[i] = 0
        elif last is not None and ((finish is not None and t[i] >= finish) or lap[i] > last):
            out[i] = last + 1
    return out


def main():
    sessions = []
    for base, picks in PICKS.items():
        df = pd.read_parquet(f"static/data/2026/{base}.parquet", columns=["session_time", "driver_number", "lap_number"])
        meta = json.load(open(f"static/data/2026/{base}.json"))
        race = (meta["session_info"].get("session_name") or "").upper() in ("R", "S")
        results = {str(r["driver"]): r.get("laps") for r in meta.get("session_results", [])}
        top = max(l for l in results.values() if l)
        drivers = []
        for pick in picks:
            dns = df.driver_number.astype(int)
            if pick == "lapped":
                d = next(
                    d for d in meta["drivers"].values()
                    if results.get(str(d["driver_number"])) == top - 1 and (dns == d["driver_number"]).any()
                )
            else:
                d = next(d for d in meta["drivers"].values() if d["abbreviation"] == pick)
            dn = d["driver_number"]
            g = df[dns == dn].sort_values("session_time", kind="stable")
            t = g.session_time.to_numpy(float)
            lap = g.lap_number.to_numpy(int)
            last = results.get(str(dn)) if race else None
            valid = [{k: v.get(k) for k in ("lap_number", "lap_time", "lap_start_time")} for v in d["valid_laps"]]
            bounds = [v["lap_start_time"] for v in valid if v.get("lap_start_time") is not None]
            if last:
                f = next((v for v in valid if v["lap_number"] == last), None)
                if f and f.get("lap_start_time") is not None:
                    bounds.append(f["lap_start_time"] + f["lap_time"])
            b = np.array(sorted(bounds))
            near = np.zeros(len(t), bool)
            if len(b):
                idx = np.searchsorted(b, t)
                lo = np.abs(t - b[np.clip(idx - 1, 0, len(b) - 1)])
                hi = np.abs(t - b[np.clip(idx, 0, len(b) - 1)])
                near = np.minimum(lo, hi) <= 5
            keep = near | (np.arange(len(t)) % 25 == 0)
            t, lap = t[keep], lap[keep]
            exp = expected_labels(t, lap, valid, last)
            drivers.append({
                "driver": str(dn),
                "abbr": d["abbreviation"],
                "session_time": [round(float(x), 3) for x in t],
                "lap_number": [int(x) for x in lap],
                "valid_laps": valid,
                "expected": [int(x) for x in exp],
            })
            spans = {l: (round(float(t[exp == l].min()), 1), round(float(t[exp == l].max()), 1)) for l in sorted(set(exp)) if l in (0, 1, 2) or l >= (last or 999)}
            print(f"{base} {d['abbreviation']} classified {last}: {len(t)} samples, relabelled {int((exp != lap).sum())}, spans {spans}")
        sessions.append({
            "session": base,
            "session_info": {"session_name": meta["session_info"].get("session_name")},
            "session_results": [{"driver": str(r["driver"]), "laps": r.get("laps")} for r in meta.get("session_results", [])],
            "drivers": drivers,
        })
    with gzip.open(OUT, "wt") as f:
        json.dump({"sessions": sessions}, f, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
