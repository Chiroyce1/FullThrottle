import { describe, expect, it } from "vitest";
import type { TelemetryRow } from "$lib/types";
import { alignLapToReference } from "./align";

function makeLap(distances: number[], speeds: number[]): TelemetryRow[] {
	return distances.map((d, i) => ({ distance: d, speed: speeds[i] }) as TelemetryRow);
}

describe("alignLapToReference", () => {
	it("should return zero offset for identical laps", () => {
		const d = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		const s = [300, 290, 250, 180, 110, 120, 180, 250, 300, 310, 315];
		const lap = makeLap(d, s);
		const { rows, alignment } = alignLapToReference(lap, lap, { minOverlapM: 50 });
		expect(alignment.offsetM).toBe(0);
		expect(alignment.confident).toBe(true);
		expect(rows).toHaveLength(lap.length);
	});

	it("should recover a 90m slice shift (the Sepang quali case)", () => {
		// Reference lap: brake from 300 to 110 around d=500, accelerate out.
		const d: number[] = [];
		const s: number[] = [];
		for (let x = 0; x <= 2000; x += 10) {
			d.push(x);
			if (x < 400) s.push(300);
			else if (x < 500) s.push(300 - (x - 400) * 1.9);
			else if (x < 700) s.push(110 + (x - 500) * 0.9);
			else s.push(290);
		}
		const ref = makeLap(d, s);
		// Same lap sliced 90m early: distance origin sits 90m before the line.
		const shifted = makeLap(
			d.map((x) => x - 90),
			s,
		);
		const { rows, alignment } = alignLapToReference(ref, shifted);
		expect(alignment.offsetM).toBe(90);
		expect(alignment.correlation).toBeGreaterThan(0.99);
		expect(alignment.confident).toBe(true);
		// Aligned rows line up with the reference frame.
		expect(rows[0]?.distance).toBe(0);
	});

	it("should not mutate the input lap", () => {
		const d = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		const s = [300, 290, 250, 180, 110, 120, 180, 250, 300, 310, 315];
		const ref = makeLap(d, s);
		const other = makeLap(
			d.map((x) => x - 50),
			s,
		);
		const before = other[0]?.distance;
		alignLapToReference(ref, other, { minOverlapM: 50 });
		expect(other[0]?.distance).toBe(before);
	});

	it("should flag low confidence for unrelated laps", () => {
		const ref = makeLap(
			[0, 10, 20, 30, 40, 50],
			[300, 290, 280, 270, 260, 250],
		);
		const other = makeLap(
			[0, 10, 20, 30, 40, 50],
			[250, 260, 270, 280, 290, 300],
		);
		const { alignment } = alignLapToReference(ref, other, { minOverlapM: 10 });
		expect(alignment.confident).toBe(false);
	});

	it("should handle empty laps without throwing", () => {
		const { rows, alignment } = alignLapToReference([], []);
		expect(rows).toEqual([]);
		expect(alignment.confident).toBe(false);
	});
});
