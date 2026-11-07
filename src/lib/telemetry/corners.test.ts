/**
 * Corner analysis on real laps only. tests/fixtures/corners/laps.json.gz
 * holds real 2026 telemetry (Austin qualifying and race, Monza and Monaco
 * qualifying) and the minimum speeds computed for it independently in
 * numpy by tests/fixtures/corners/build.py. Rebuild it with that script.
 */
import { describe, expect, it } from "vitest";
import { fixture, keyIndex, lapOf, session, toRows } from "../../../tests/fixtures/corners/load";
import { analyzeCorners } from "./corners";

describe("analyzeCorners on real laps", () => {
	for (const s of fixture.sessions) {
		for (const lap of s.laps) {
			it(`${s.session} ${lap.driver} lap ${lap.lap} (${lap.case}) matches the numpy reference`, () => {
				const { readings } = analyzeCorners(s.corners, [toRows(lap)]);
				expect(readings[0].map((r) => r?.minSpeed ?? null)).toEqual(
					lap.expected.map((e) => e.min),
				);
			});
		}
	}

	it("reads Austin T1 from the raw samples (VER pole lap: 83 km/h at 644 m)", () => {
		const s = session("f1_2026_rd18_q");
		const [t1] = analyzeCorners(s.corners, [toRows(lapOf(s, "VER"))]).readings[0];
		expect(t1?.minSpeed).toBe(83);
		expect(t1?.apexDist).toBeCloseTo(643.9, 0);
	});

	it("keeps each Monza chicane corner separate", () => {
		const s = session("f1_2026_rd13_q");
		const [r] = analyzeCorners(s.corners, [toRows(lapOf(s, "VER"))]).readings;
		for (const [a, b] of [["1", "2"], ["4", "5"]]) {
			const ra = r[keyIndex(s, a)]!;
			const rb = r[keyIndex(s, b)]!;
			expect(ra.apexDist).toBeLessThan(rb.apexDist);
		}
	});

	it("blanks GAS's Monza T4 dropout instead of reading 308 km/h", () => {
		const s = session("f1_2026_rd13_q");
		const [r] = analyzeCorners(s.corners, [toRows(lapOf(s, "GAS"))]).readings;
		expect(r[keyIndex(s, "4")]).toBeNull();
	});

	it("blanks T20 on NOR's pit in-lap rather than reading the pit-lane limiter", () => {
		const s = session("f1_2026_rd18_r");
		const lap = s.laps.find((l) => l.case === "not driven")!;
		const [r] = analyzeCorners(s.corners, [toRows(lap)]).readings;
		expect(r[keyIndex(s, "20")]).toBeNull();
		expect(r.filter((x) => x !== null).length).toBe(s.corners.length - 1);
	});

	it("places corners on the chart using the reference lap's own distance", () => {
		const s = session("f1_2026_rd18_q");
		const ver = toRows(lapOf(s, "VER"));
		const shifted = ver.map((r) => ({ ...r, distance: r.distance + 37 }));
		const a = analyzeCorners(s.corners, [ver]).corners;
		const b = analyzeCorners(s.corners, [shifted]).corners;
		a.forEach((c, k) => expect(b[k].distance - c.distance).toBeCloseTo(37, 5));
	});

	it("agrees across drivers on the same pole-lap corner (Austin qualifying)", () => {
		const s = session("f1_2026_rd18_q");
		const { readings } = analyzeCorners(s.corners, s.laps.map(toRows));
		const spreads = s.corners.map((_, k) => {
			const v = readings.map((l) => l[k]?.minSpeed).filter((x): x is number => x != null);
			const m = v.reduce((a, b) => a + b, 0) / v.length;
			return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
		});
		// Old algorithm: 9.4 km/h average spread across 2026 qualifying.
		expect(spreads.reduce((a, b) => a + b) / spreads.length).toBeLessThan(5);
	});
});
