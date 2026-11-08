/**
 * Track outline on real data: the 2026 Monaco race, where only the early
 * laps carry real positions; later ones drift along a line kilometres long
 * or sit at (0, 0) (tests/fixtures/track-path/build.py).
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { TelemetryRow } from "$lib/types";
import { extractTrackPath, isConsistentPath } from "./track";

type Cols = Record<"driver_number" | "lap_number" | "session_time" | "x" | "y", number[]>;
const fx: { winner: string; corrupt: Cols; clean: Cols; qualifyingBox: number[] } = JSON.parse(
	gunzipSync(readFileSync("tests/fixtures/track-path/monaco-race.json.gz")).toString(),
);

const rows = (c: Cols) =>
	c.session_time.map(
		(_, i) =>
			({
				driver_number: c.driver_number[i],
				lap_number: c.lap_number[i],
				session_time: c.session_time[i],
				x: c.x[i],
				y: c.y[i],
			}) as TelemetryRow,
	);

/** Group like TelemetryEngine does, with per-lap point counts. */
function group(list: TelemetryRow[]) {
	const counts: Record<string, Record<number, number>> = { [fx.winner]: {} };
	for (const r of list) counts[fx.winner][r.lap_number] = (counts[fx.winner][r.lap_number] ?? 0) + 1;
	return { grouped: { [fx.winner]: list }, counts };
}

describe("extractTrackPath on the 2026 Monaco race", () => {
	const [qx0, qx1, qy0, qy1] = fx.qualifyingBox;

	it("rejects the drifting laps as a circuit outline", () => {
		const corrupt = rows(fx.corrupt);
		for (const lap of [10, 11, 12]) {
			const path = corrupt.filter((r) => r.lap_number === lap);
			const ys = path.map((r) => r.y);
			expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(20_000); // >2 km of straight drift
			expect(isConsistentPath(path)).toBe(false);
		}
	});

	it("draws the circuit from a clean lap, never the corrupt ones", () => {
		const { grouped, counts } = group([...rows(fx.corrupt), ...rows(fx.clean)].sort((a, b) => a.session_time - b.session_time));
		const path = extractTrackPath(grouped, counts, fx.winner);
		expect(path.length).toBeGreaterThan(80);
		for (const p of path) {
			expect(p.x).toBeGreaterThanOrEqual(qx0 - 50);
			expect(p.x).toBeLessThanOrEqual(qx1 + 50);
			expect(p.y).toBeGreaterThanOrEqual(qy0 - 50);
			expect(p.y).toBeLessThanOrEqual(qy1 + 50);
		}
	});

	it("returns no outline rather than a wrong one when every lap is corrupt", () => {
		const { grouped, counts } = group(rows(fx.corrupt));
		expect(extractTrackPath(grouped, counts, fx.winner)).toEqual([]);
	});
});
