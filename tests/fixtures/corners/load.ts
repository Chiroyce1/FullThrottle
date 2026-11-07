/**
 * Real-lap corner fixture (see build.py): 2026 Austin qualifying and race,
 * Monza and Monaco qualifying, with minimum speeds computed in numpy.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { TrackCorner } from "$lib/track-corners";
import type { TelemetryRow } from "$lib/types";

export interface FixtureLap {
	driver: string;
	lap: number;
	case: "best" | "green" | "vsc" | "not driven" | "gap";
	rows: Record<"session_time" | "distance" | "speed" | "rpm" | "n_gear" | "x" | "y", number[]>;
	expected: { min: number | null; why?: string }[];
}

export interface FixtureSession {
	session: string;
	track: string;
	corners: TrackCorner[];
	laps: FixtureLap[];
}

export const fixture: { sessions: FixtureSession[] } = JSON.parse(
	gunzipSync(readFileSync("tests/fixtures/corners/laps.json.gz")).toString(),
);

export const session = (name: string) => fixture.sessions.find((s) => s.session === name)!;

export const lapOf = (s: FixtureSession, driver: string, lap?: number) =>
	s.laps.find((l) => l.driver === driver && (lap === undefined || l.lap === lap))!;

/** Fixture columns back into telemetry rows, as the engine hands them over. */
export function toRows(lap: FixtureLap): TelemetryRow[] {
	const c = lap.rows;
	return c.distance.map(
		(_, i) =>
			({
				session_time: c.session_time[i],
				distance: c.distance[i],
				speed: c.speed[i],
				rpm: c.rpm[i],
				n_gear: c.n_gear[i],
				x: c.x[i],
				y: c.y[i],
			}) as TelemetryRow,
	);
}

/** Index of a corner key ("9A") in track order. */
export const keyIndex = (s: FixtureSession, key: string) =>
	[...s.corners]
		.sort((a, b) => a.distance - b.distance)
		.findIndex((c) => `${c.number}${c.letter}` === key);
