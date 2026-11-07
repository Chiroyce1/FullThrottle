"""Builds laps.json.gz: real laps plus independently computed corner minimums.

The corner tests run only on real telemetry. This script picks laps from
local sessions (static/data is gitignored, the fixture is committed) that
cover what real data throws at the code: clean qualifying laps, chicanes,
race laps with sampling gaps, safety-car laps, pit laps that skip corners,
and forward-filled dropouts. Expected results are computed here in numpy,
separately from the TypeScript implementation.

Definition: a corner's minimum speed is the lowest speed recorded between
its entry and exit (static/tracks/*.json, from ingest/corner_spans.py).
Entry and exit are projected onto the lap's path (the polyline through
its samples), so sampling gaps don't move them. A reading is null when
the path doesn't pass within LOCATE_TOLERANCE_M of entry or exit (pit
lane, off track), when a dropout (speed, RPM and gear frozen for
FROZEN_RUN_M+) touches the corner, or when a gap longer than MAX_GAP_M
could hide the apex: speed falling into the gap and rising out of it.

Usage (from the repo root):
  uv run --no-project --with numpy --with pandas --with pyarrow \
    python tests/fixtures/corners/build.py
"""
import gzip
import json
import os

import numpy as np
import pandas as pd

LOCATE_TOLERANCE_M = 10.0  # normal laps: 99.9% within 3.4 m; pit lane runs ~20 m off
MAX_GAP_M = 40.0
FROZEN_RUN_M = 80.0
COLS = ["session_time", "distance", "speed", "rpm", "n_gear", "x", "y"]
OUT = os.path.join(os.path.dirname(__file__), "laps.json.gz")

# session, track file, laps to take: ("best", abbr) = that driver's fastest
# valid lap; (abbr, lap_number) = a specific lap, picked below by scan.
PICKS = {
    ("f1_2026_rd18_q", "austin"): [("best", a) for a in ["VER", "NOR", "LEC", "RUS", "HAM", "ANT"]],
    ("f1_2026_rd13_q", "monza"): [("best", a) for a in ["NOR", "VER", "GAS"]],  # GAS: dropout
    ("f1_2026_rd6_q", "monaco"): [("best", a) for a in ["VER", "LEC", "NOR"]],
    ("f1_2026_rd18_r", "austin"): "scan",  # green, VSC, pit and gappy race laps
}


def load(base):
    df = pd.read_parquet(f"static/data/2026/{base}.parquet", columns=COLS + ["driver_number", "lap_number", "track_status"])
    meta = json.load(open(f"static/data/2026/{base}.json"))
    abbr = {int(d["driver_number"]): d["abbreviation"] for d in meta["drivers"].values()}
    return df, meta, abbr


def lap_rows(df, dn, lap_number):
    lap = df[(df.driver_number.astype(int) == int(dn)) & (df.lap_number == lap_number)].sort_values("session_time")
    lap = lap[~((lap.x == 0) & (lap.y == 0))].copy()
    lap["distance"] = lap.distance - lap.distance.iloc[0]  # as TelemetryEngine slices it
    return lap


def frozen_mask(lap):
    v, r, g, d = (lap[c].to_numpy() for c in ["speed", "rpm", "n_gear", "distance"])
    mask = np.zeros(len(lap), bool)
    start = 0
    for i in range(1, len(lap) + 1):
        if i < len(lap) and v[i] == v[start] and r[i] == r[start] and g[i] == g[start]:
            continue
        if i - start > 2 and d[i - 1] - d[start] >= FROZEN_RUN_M:
            mask[start:i] = True
        start = i
    return mask


def project(px, py, d, x, y, around, radius):
    """Lap distance of the closest point on the lap's path to (px, py), and how far off it is (m)."""
    best = (None, np.inf)
    for i in np.where(np.abs(d[:-1] - around) <= radius)[0]:
        ax, ay, bx, by = x[i], y[i], x[i + 1], y[i + 1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else min(1.0, max(0.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        off = np.hypot(ax + t * dx - px, ay + t * dy - py) / 10.0  # decimetres -> m
        if off < best[1]:
            best = (d[i] + t * (d[i + 1] - d[i]), off)
    return best


def expected(lap, corners):
    d, x, y, v = (lap[c].to_numpy(float) for c in ["distance", "x", "y", "speed"])
    frozen = frozen_mask(lap)
    n = len(d)
    out = []
    for c in corners:
        mid, _ = project(c["x"], c["y"], d, x, y, c["distance"], 500)
        if mid is None:
            out.append({"min": None, "why": "not on lap"})
            continue
        de, e_off = project(c["entry"]["x"], c["entry"]["y"], d, x, y, mid, 300)
        dx_, x_off = project(c["exit"]["x"], c["exit"]["y"], d, x, y, mid, 300)
        if de is None or dx_ is None or dx_ < de or max(e_off, x_off) > LOCATE_TOLERANCE_M:
            out.append({"min": None, "why": "not driven"})
            continue
        inside = np.where((d >= de) & (d <= dx_))[0]
        # Samples bordering the corner too, so a gap across entry/exit is seen.
        lo, hi = max(0, inside[0] - 1 if len(inside) else np.searchsorted(d, de) - 1), \
            min(n - 1, inside[-1] + 1 if len(inside) else np.searchsorted(d, dx_))
        if frozen[lo : hi + 1].any():
            out.append({"min": None, "why": "dropout"})
            continue
        hidden = len(inside) == 0
        for i in range(lo, hi):
            if d[i + 1] - d[i] <= MAX_GAP_M:
                continue
            falling_in = i == 0 or v[i - 1] > v[i]
            rising_out = i + 2 >= n or v[i + 2] > v[i + 1]
            if falling_in and rising_out:
                hidden = True
        if hidden:
            out.append({"min": None, "why": "gap"})
            continue
        out.append({"min": int(v[inside].min())})
    return out


def scan_race(df, meta, abbr, corners):
    """Pick race laps that each show one real-world case."""
    want = {"green": 3, "vsc": 1, "not driven": 1, "gap": 1}
    picked = []
    for (dn, ln), g in df.groupby(["driver_number", "lap_number"]):
        if ln <= 1 or not any(want.values()):
            continue
        lap = lap_rows(df, dn, ln)
        if len(lap) < 200 or lap.distance.iloc[-1] < 4000:
            continue
        exp = expected(lap, corners)
        whys = {e.get("why") for e in exp}
        status = set(g.track_status.unique())
        case = None
        if want["vsc"] and status & {6, 7}:
            case = "vsc"
        elif want["not driven"] and "not driven" in whys:
            case = "not driven"
        elif want["gap"] and "gap" in whys:
            case = "gap"
        elif want["green"] and status == {1} and whys == {None}:
            case = "green"
        if case:
            want[case] -= 1
            picked.append((abbr[int(dn)], int(ln), case))
    return picked


def main():
    sessions = []
    for (base, track), picks in PICKS.items():
        df, meta, abbr = load(base)
        corners = sorted(json.load(open(f"static/tracks/{track}.json"))["corners"], key=lambda c: c["distance"])
        by_abbr = {d["abbreviation"]: d for d in meta["drivers"].values()}
        if picks == "scan":
            chosen = scan_race(df, meta, abbr, corners)
        else:
            chosen = []
            for _, a in picks:
                best = min(by_abbr[a]["valid_laps"], key=lambda l: l["lap_time"])
                chosen.append((a, best["lap_number"], "best"))
        laps = []
        for a, ln, case in chosen:
            lap = lap_rows(df, by_abbr[a]["driver_number"], ln)
            laps.append({
                "driver": a,
                "lap": ln,
                "case": case,
                "rows": {c: [round(float(v), 3) for v in lap[c]] for c in COLS},
                "expected": expected(lap, corners),
            })
            nulls = [e["why"] for e in laps[-1]["expected"] if e["min"] is None]
            print(f"{base} {a} lap {ln} ({case}): {len(lap)} samples, null: {nulls or 'none'}")
        sessions.append({"session": base, "track": track, "corners": corners, "laps": laps})

    with gzip.open(OUT, "wt") as f:
        json.dump({"sessions": sessions}, f, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
