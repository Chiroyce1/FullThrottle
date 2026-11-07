import { describe, expect, it } from "vitest";
import type { TelemetryRow } from "$lib/types";
import { analyzeCorners } from "$lib/telemetry/corners";
import { LICO_COLOR } from "$lib/constants";
import { lapOf, session, toRows } from "../../../../tests/fixtures/corners/load";
import {
	activeCornerAt,
	activeCornerSummary,
	computeApexMarkers,
	computeLicoHighlights,
	cornerRows,
	cornerTally,
	hoverCursorDots,
	CORNER_PROXIMITY,
	type LapIdentity,
} from "./view-derivations";

const row = (r: Partial<TelemetryRow>) => r as TelemetryRow;

// Real 2026 Austin pole-shootout laps; expected minimums come from the
// numpy reference in the fixture, not from the code under test.
const austin = session("f1_2026_rd18_q");
const ver = lapOf(austin, "VER");
const nor = lapOf(austin, "NOR");
const laps: LapIdentity[] = [
	{ tla: "VER", color: "#3671c6" },
	{ tla: "NOR", color: "#ff8000" },
];
const analysis = analyzeCorners(austin.corners, [toRows(ver), toRows(nor)]);
const expectedMins = analysis.corners.map((_, k) => [ver.expected[k].min, nor.expected[k].min]);

describe("computeLicoHighlights", () => {
	it("marks off-throttle, off-brake stretches longer than the minimum", () => {
		const lap = [0, 10, 20, 30, 40, 50, 60].map((d) =>
			row({ distance: d, throttle: d >= 10 && d <= 50 ? 0 : 100, brake: false }),
		);
		expect(computeLicoHighlights([lap])).toEqual([
			{ start: 10, end: 50, color: LICO_COLOR, label: "LiCO" },
		]);
	});

	it("ignores braking zones and short lifts", () => {
		const braking = [0, 10, 20, 30, 40].map((d) =>
			row({ distance: d, throttle: 0, brake: true }),
		);
		const shortLift = [0, 5, 10, 15].map((d) =>
			row({ distance: d, throttle: d === 5 || d === 10 ? 0 : 100, brake: false }),
		);
		expect(computeLicoHighlights([braking, shortLift])).toEqual([]);
	});

	it("respects a custom throttle threshold", () => {
		const lap = [0, 10, 20, 30, 40, 50].map((d) =>
			row({ distance: d, throttle: d >= 10 && d <= 40 ? 12 : 100, brake: false }),
		);
		expect(computeLicoHighlights([lap], 10)).toEqual([]);
		expect(computeLicoHighlights([lap], 15)).toHaveLength(1);
	});

	it("closes a stretch that runs to the end of the lap", () => {
		const lap = [0, 10, 20, 30, 40].map((d) =>
			row({ distance: d, throttle: d === 0 ? 100 : 0, brake: false }),
		);
		expect(computeLicoHighlights([lap])).toHaveLength(1);
	});
});

describe("hoverCursorDots", () => {
	it("places the cursor on the fastest driver with the speed gap", () => {
		const dots = hoverCursorDots([
			{ tla: "ANT", row: row({ x: 1, y: 2, z: 3, speed: 210 }) },
			{ tla: "LEC", row: row({ x: 4, y: 5, z: 6, speed: 218.4 }) },
		]);
		expect(dots).toEqual([
			{ id: "hover-cursor", label: "LEC +8km/h", x: 4, y: 5, z: 6, color: "#ffffff" },
		]);
	});

	it("omits the gap for a single driver or a tie", () => {
		expect(hoverCursorDots([{ tla: "ANT", row: row({ x: 1, y: 1, speed: 200 }) }])[0].label).toBe("ANT");
		expect(
			hoverCursorDots([
				{ tla: "ANT", row: row({ x: 1, y: 1, speed: 200 }) },
				{ tla: "LEC", row: row({ x: 2, y: 2, speed: 200.2 }) },
			])[0].label,
		).toBe("LEC");
	});

	it("skips missing and origin/NaN positions", () => {
		expect(
			hoverCursorDots([
				null,
				{ tla: "ANT", row: row({ x: 0, y: 0, speed: 300 }) },
				{ tla: "LEC", row: row({ x: NaN, y: 1, speed: 300 }) },
			]),
		).toEqual([]);
	});
});

describe("activeCornerAt", () => {
	const { corners } = analysis;

	it("returns the key of the corner at the hover distance", () => {
		for (const c of corners) expect(activeCornerAt(corners, c.distance)).toBe(c.key);
	});

	it("is null on the back straight, and when not hovering", () => {
		const t11 = corners.find((c) => c.key === "11")!;
		const t12 = corners.find((c) => c.key === "12")!;
		expect(t12.distance - t11.distance).toBeGreaterThan(2 * CORNER_PROXIMITY);
		expect(activeCornerAt(corners, (t11.distance + t12.distance) / 2)).toBeNull();
		expect(activeCornerAt(corners, null)).toBeNull();
	});
});

describe("cornerRows / cornerTally", () => {
	const rows = cornerRows(analysis, 2);

	it("lists every corner with both laps' minimums", () => {
		expect(rows.map((r) => r.speeds)).toEqual(expectedMins);
	});

	it("names the faster lap and the margin", () => {
		rows.forEach((r, k) => {
			const [v, n] = expectedMins[k] as [number, number];
			expect(r.leader).toBe(v === n ? null : v > n ? 0 : 1);
			expect(r.margin).toBe(v === n ? null : Math.abs(v - n));
		});
	});

	it("tallies every corner as a win or a tie", () => {
		const { wins, ties } = cornerTally(rows, 2);
		expect(wins[0] + wins[1] + ties).toBe(analysis.corners.length);
		expect(wins[0]).toBe(expectedMins.filter(([v, n]) => v! > n!).length);
	});
});

describe("computeApexMarkers", () => {
	const markers = computeApexMarkers(analysis, laps);

	it("puts a dot at each lap's own minimum, flagging the faster one", () => {
		for (const m of markers) {
			const k = analysis.corners.findIndex((c) => c.key === m.key);
			const [v, n] = expectedMins[k] as [number, number];
			const top = Math.max(v, n);
			expect(m.drivers.map((d) => [d.tla, d.speed, d.isFastest])).toEqual([
				["VER", v, v === top],
				["NOR", n, n === top],
			]);
			expect(m.drivers[0].distance).toBe(analysis.readings[0][k]!.apexDist);
		}
	});

	it("leaves out corners both laps took flat out", () => {
		const flat = analysis.corners.filter((_, k) => analysis.readings.every((l) => l[k]!.flat));
		expect(flat.length).toBeGreaterThan(0);
		expect(markers.map((m) => m.key)).toEqual(
			analysis.corners.filter((c) => !flat.includes(c)).map((c) => c.key),
		);
	});
});

describe("activeCornerSummary", () => {
	const rows = cornerRows(analysis, 2);

	it("reports each lap's minimum with its delta to the fastest at Austin T1", () => {
		const [v, n] = expectedMins[0] as [number, number];
		const top = Math.max(v, n);
		const summary = activeCornerSummary(rows, "1", laps)!;
		expect(summary.corner.key).toBe("1");
		expect(summary.speeds.map((s) => [s.tla, s.minSpeed, s.deltaVsFastest])).toEqual([
			["VER", v, v - top],
			["NOR", n, n - top],
		]);
	});

	it("is null without an active corner, or for a corner with no readings", () => {
		expect(activeCornerSummary(rows, null, laps)).toBeNull();
		expect(activeCornerSummary(rows, "99", laps)).toBeNull();
		const gas = lapOf(session("f1_2026_rd13_q"), "GAS");
		const monza = analyzeCorners(session("f1_2026_rd13_q").corners, [toRows(gas)]);
		expect(activeCornerSummary(cornerRows(monza, 1), "4", laps.slice(0, 1))).toBeNull();
	});
});
