"""Adds each corner's entry and exit points to static/tracks/*.json.

A corner runs from where the track starts turning to where it stops. The
span is measured once per circuit from real telemetry: the cleanest of the
fastest qualifying laps in the newest local session at that circuit.

Method: resample the lap's XY onto a 2 m grid, smooth out GPS jitter, and
compute curvature (heading change in deg/m). Each corner's apex is the
sharpest turn within its half of the gap to the neighbouring markers. The
span grows out from the apex while the track keeps turning the same way
faster than STRAIGHT_DEG_PER_M. Corners sharing one bend (triple apexes,
same-direction complexes) are split at the least-turning point between
their apexes.

The app finds entry and exit on each lap by position and reports the
lowest speed recorded between them.

Usage: python ingest/corner_spans.py [--data static/data] [--tracks static/tracks]
"""
import argparse
import glob
import json
import os

import numpy as np
import pandas as pd

from extract_tracks import sanitize_filename

GRID_M = 2.0
STRAIGHT_DEG_PER_M = 0.15  # radius above ~380 m counts as straight
SMOOTH_POINTS = 11  # ~20 m position smoothing
APEX_SEARCH_M = 100  # for the first/last corner, which has no neighbour on one side


def newest_qualifying_by_track(data_dir: str) -> dict[str, str]:
    """Track filename -> path of the newest local qualifying session (without extension)."""
    found: dict[str, str] = {}
    for meta_path in sorted(glob.glob(os.path.join(data_dir, "*", "f1_*_q.json"))):
        base = meta_path[: -len(".json")]
        if not os.path.exists(base + ".parquet"):
            continue
        with open(meta_path) as f:
            location = json.load(f)["session_info"].get("location")
        if location:
            # Sorted by year then round, so later sessions overwrite earlier ones.
            found[sanitize_filename(location)] = base
    return found


def reference_lap(base: str) -> pd.DataFrame:
    """Cleanest lap (smallest gap between samples) among the 5 fastest drivers' best laps."""
    with open(base + ".json") as f:
        meta = json.load(f)
    df = pd.read_parquet(base + ".parquet", columns=["driver_number", "lap_number", "session_time", "x", "y"])
    bests = []
    for d in meta["drivers"].values():
        if d.get("valid_laps"):
            lap = min(d["valid_laps"], key=lambda l: l["lap_time"])
            bests.append((lap["lap_time"], d["driver_number"], lap["lap_number"]))
    best_lap, best_gap = None, np.inf
    for _, dn, lap_number in sorted(bests)[:5]:
        lap = df[(df.driver_number.astype(int) == int(dn)) & (df.lap_number == lap_number)]
        lap = lap.sort_values("session_time")
        lap = lap[~((lap.x == 0) & (lap.y == 0))]
        if len(lap) < 100:
            continue
        gap = np.hypot(np.diff(lap.x), np.diff(lap.y)).max() / 10.0
        if gap < best_gap:
            best_lap, best_gap = lap, gap
    return best_lap


def geometry(lap: pd.DataFrame):
    """Grid positions (decimetres, like the track files) and curvature in deg/m."""
    xy = lap[["x", "y"]].to_numpy(dtype=float)
    seg = np.hypot(*np.diff(xy, axis=0).T) / 10.0
    xy = xy[np.r_[True, seg > 0.01]]
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(xy, axis=0).T) / 10.0)]
    grid = np.arange(0, s[-1], GRID_M)
    gx, gy = np.interp(grid, s, xy[:, 0]), np.interp(grid, s, xy[:, 1])
    k = np.ones(SMOOTH_POINTS) / SMOOTH_POINTS
    sx, sy = np.convolve(gx, k, "same"), np.convolve(gy, k, "same")
    heading = np.unwrap(np.arctan2(np.gradient(sy), np.gradient(sx)))
    curv = np.convolve(np.degrees(np.gradient(heading)) / GRID_M, np.ones(5) / 5, "same")
    return gx, gy, heading, curv


def corner_spans(corners: list[dict], gx, gy, curv) -> list[tuple[int, int, int]]:
    """(entry, apex, exit) grid indices per corner, corners sorted by track order."""
    at = [int(np.argmin(np.hypot(gx - c["x"], gy - c["y"]))) for c in corners]
    reach = int(APEX_SEARCH_M / GRID_M)
    n, last = len(at), len(gx) - 1
    apexes = []
    for k, i in enumerate(at):
        lo = (at[k - 1] + i) // 2 + 1 if k > 0 else max(0, i - reach)
        hi = (i + at[k + 1]) // 2 if k < n - 1 else min(last, i + reach)
        lo, hi = min(lo, i), max(hi, i)
        apexes.append(lo + int(np.argmax(np.abs(curv[lo : hi + 1]))))

    spans = []
    for j in apexes:
        sign = np.sign(curv[j])
        a = b = j
        while a > 0 and curv[a - 1] * sign > STRAIGHT_DEG_PER_M:
            a -= 1
        while b < last and curv[b + 1] * sign > STRAIGHT_DEG_PER_M:
            b += 1
        spans.append([a, j, b])

    for k in range(1, n):
        if spans[k][0] < spans[k - 1][2]:
            p0, p1 = apexes[k - 1], apexes[k]
            cut = p0 + int(np.argmin(np.abs(curv[p0 : p1 + 1]))) if p1 > p0 else p0
            spans[k - 1][2] = cut
            spans[k][0] = cut
    return [tuple(s) for s in spans]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--data", default="static/data")
    parser.add_argument("--tracks", default="static/tracks")
    args = parser.parse_args()

    sessions = newest_qualifying_by_track(args.data)
    for track_path in sorted(glob.glob(os.path.join(args.tracks, "*.json"))):
        name = os.path.basename(track_path)[: -len(".json")]
        if name not in sessions:
            print(f"{name}: no local qualifying data, skipped")
            continue
        with open(track_path) as f:
            track = json.load(f)
        corners = sorted(track["corners"], key=lambda c: c["distance"])
        if not corners:
            print(f"{name}: no corners, skipped")
            continue
        lap = reference_lap(sessions[name])
        if lap is None:
            print(f"{name}: no usable reference lap, skipped")
            continue
        gx, gy, heading, curv = geometry(lap)
        for c, (a, _, b) in zip(corners, corner_spans(corners, gx, gy, curv)):
            c["entry"] = {"x": round(float(gx[a]), 1), "y": round(float(gy[a]), 1)}
            c["exit"] = {"x": round(float(gx[b]), 1), "y": round(float(gy[b]), 1)}
        with open(track_path, "w") as f:
            json.dump(track, f, indent=4)  # same format as extract_tracks.py
        print(f"{name}: {len(corners)} corners from {os.path.basename(sessions[name])}")


if __name__ == "__main__":
    main()
