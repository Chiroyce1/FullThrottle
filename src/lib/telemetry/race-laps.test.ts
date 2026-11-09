/**
 * Lap labels on real race samples only. tests/fixtures/laps/laps.json.gz
 * holds real 2026 Brazil and Austin (OpenF1) and Australia (FastF1) race
 * samples, with labels computed independently in numpy by
 * tests/fixtures/laps/build.py. Rebuild it with that script.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { TelemetryMeta, TelemetryRow, ValidLap } from "$lib/types";
import { BEFORE_START_LAP, classifiedLaps, raceLaps, relabelLaps } from "./race-laps";

interface FixtureDriver {
	driver: string;
	abbr: string;
	session_time: number[];
	lap_number: number[];
	valid_laps: ValidLap[];
	expected: number[];
}

const fixture: {
	sessions: (Pick<TelemetryMeta, "session_info" | "session_results"> & { session: string; drivers: FixtureDriver[] })[];
} = JSON.parse(gunzipSync(readFileSync("tests/fixtures/laps/laps.json.gz")).toString());

const meta = (s: (typeof fixture.sessions)[number]) => s as unknown as TelemetryMeta;

function relabelled(s: (typeof fixture.sessions)[number], d: FixtureDriver): TelemetryRow[] {
	const rows = d.session_time.map((t, i) => ({ session_time: t, lap_number: d.lap_number[i] }) as TelemetryRow);
	relabelLaps(rows, d.valid_laps, classifiedLaps(meta(s), d.driver));
	return rows;
}

const span = (rows: TelemetryRow[], lap: number) => {
	const t = rows.filter((r) => r.lap_number === lap).map((r) => r.session_time);
	return Math.max(...t) - Math.min(...t);
};

describe("relabelLaps on real races", () => {
	for (const s of fixture.sessions) {
		for (const d of s.drivers) {
			it(`${s.session} ${d.abbr} matches the numpy reference`, () => {
				expect(relabelled(s, d).map((r) => r.lap_number)).toEqual(d.expected);
			});
		}
	}

	const brazil = fixture.sessions.find((s) => s.session === "f1_2026_rd20_r")!;
	const nor = brazil.drivers.find((d) => d.abbr === "NOR")!;

	it("moves Brazil's grid and formation lap out of lap 1 (NOR lap 1: 93.722 s)", () => {
		const rows = relabelled(brazil, nor);
		expect(span(rows, 1)).toBeGreaterThan(90);
		expect(span(rows, 1)).toBeLessThan(94);
		expect(rows.filter((r) => r.lap_number === BEFORE_START_LAP).every((r) => r.session_time < 201.863)).toBe(true);
	});

	it("ends NOR's lap 71 at the flag and labels the run back 72", () => {
		const rows = relabelled(brazil, nor);
		expect(span(rows, 71)).toBeLessThan(88);
		expect(rows.filter((r) => r.lap_number === 72).every((r) => r.session_time >= 5838.254 + 87.621)).toBe(true);
	});

	it("uses a lapped driver's own classified laps", () => {
		const gas = brazil.drivers.find((d) => d.abbr === "GAS")!;
		expect(classifiedLaps(meta(brazil), gas.driver)).toBe(70);
		expect(Math.max(...relabelled(brazil, gas).map((r) => r.lap_number))).toBe(71);
	});

	it("leaves FastF1 sessions untouched", () => {
		const aus = fixture.sessions.find((s) => s.session === "f1_2026_rd1_r")!;
		for (const d of aus.drivers) expect(relabelled(aus, d).map((r) => r.lap_number)).toEqual(d.lap_number);
	});

	it("counts Brazil as 71 laps, from the classification", () => {
		expect(raceLaps(meta(brazil))).toBe(71);
	});
});
