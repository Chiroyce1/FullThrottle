import { describe, expect, it } from "vitest";
import type { TelemetryRow } from "$lib/types";
import type { TrackCorner } from "$lib/track-corners";
import { computeCornerSpeeds } from "./corner-speeds";

describe("computeCornerSpeeds", () => {
	it("should handle empty corner list", () => {
		const result = computeCornerSpeeds([], []);
		expect(result).toEqual([]);
	});

	it("should handle empty lap data by returning corners with null speeds", () => {
		const corners: TrackCorner[] = [
			{ number: 1, letter: "", angle: 90, distance: 200, x: 0, y: 0 },
			{ number: 2, letter: "A", angle: 45, distance: 450, x: 0, y: 0 },
		];
		const result = computeCornerSpeeds(corners, []);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			corner: 1,
			letter: "",
			label: "1",
			distance: 200,
			minSpeed: null,
			minSpeedDist: null,
			entrySpeed: null,
			exitSpeed: null,
		});
		expect(result[1]).toEqual({
			corner: 2,
			letter: "A",
			label: "2A",
			distance: 450,
			minSpeed: null,
			minSpeedDist: null,
			entrySpeed: null,
			exitSpeed: null,
		});
	});

	it("should correctly find the minimum apex speed in the corner window", () => {
		const corners: TrackCorner[] = [
			{ number: 1, letter: "", angle: 90, distance: 500, x: 0, y: 0 },
		];

		// Simulate deceleration into T1 at 500m (braking from 300 to 110, then accelerating to 240)
		const lapData: TelemetryRow[] = [
			{ distance: 350, speed: 310 } as TelemetryRow,
			{ distance: 400, speed: 300 } as TelemetryRow,
			{ distance: 440, speed: 220 } as TelemetryRow,
			{ distance: 480, speed: 130 } as TelemetryRow,
			{ distance: 505, speed: 110 } as TelemetryRow, // true apex
			{ distance: 530, speed: 160 } as TelemetryRow,
			{ distance: 560, speed: 230 } as TelemetryRow,
			{ distance: 600, speed: 270 } as TelemetryRow,
		];

		const result = computeCornerSpeeds(corners, lapData);
		expect(result).toHaveLength(1);
		expect(result[0].corner).toBe(1);
		expect(result[0].minSpeed).toBe(110);
		expect(result[0].minSpeedDist).toBe(505);
		expect(result[0].entrySpeed).toBe(300); // at 400m (500 - 100 approach)
		expect(result[0].exitSpeed).toBe(160); // at 530m (500 + 50 exit)
	});

	it("should not allow adjacent corners to contaminate each other's search windows", () => {
		// Chicane: T1 at 300m, T2 at 370m (70m apart)
		const corners: TrackCorner[] = [
			{ number: 1, letter: "", angle: 90, distance: 300, x: 0, y: 0 },
			{ number: 2, letter: "", angle: -90, distance: 370, x: 0, y: 0 },
		];

		// Heavy braking into T1 (down to 95 km/h), brief throttle up to 150 km/h, then T2 apex at 125 km/h
		const lapData: TelemetryRow[] = [
			{ distance: 220, speed: 280 } as TelemetryRow,
			{ distance: 260, speed: 180 } as TelemetryRow,
			{ distance: 295, speed: 95 } as TelemetryRow, // T1 apex
			{ distance: 315, speed: 120 } as TelemetryRow,
			{ distance: 335, speed: 150 } as TelemetryRow, // between T1 and T2
			{ distance: 368, speed: 125 } as TelemetryRow, // T2 apex
			{ distance: 390, speed: 170 } as TelemetryRow,
			{ distance: 430, speed: 240 } as TelemetryRow,
		];

		const result = computeCornerSpeeds(corners, lapData);
		expect(result).toHaveLength(2);
		expect(result[0].corner).toBe(1);
		expect(result[0].minSpeed).toBe(95);

		expect(result[1].corner).toBe(2);
		// T2 should find 125 km/h and NOT pick up T1's 95 km/h because approach window is restricted!
		expect(result[1].minSpeed).toBe(125);
		expect(result[1].minSpeedDist).toBe(368);
	});

	it("should return null for corners beyond truncated lap telemetry", () => {
		const corners: TrackCorner[] = [
			{ number: 1, letter: "", angle: 90, distance: 300, x: 0, y: 0 },
			{ number: 15, letter: "", angle: 45, distance: 4500, x: 0, y: 0 },
		];

		const lapData: TelemetryRow[] = [
			{ distance: 250, speed: 280 } as TelemetryRow,
			{ distance: 300, speed: 120 } as TelemetryRow,
			{ distance: 350, speed: 220 } as TelemetryRow,
			{ distance: 1000, speed: 300 } as TelemetryRow,
		];

		const result = computeCornerSpeeds(corners, lapData);
		expect(result).toHaveLength(2);
		expect(result[0].minSpeed).toBe(120);
		expect(result[1].minSpeed).toBeNull();
		expect(result[1].minSpeedDist).toBeNull();
	});

	it("should use exact corner apex speed for flat-out acceleration kinks without false troughs", () => {
		// e.g. T17 kink at 4235m following T16 exit (speed accelerating monotonically from 174 to 260)
		const corners: TrackCorner[] = [
			{ number: 17, letter: "", angle: -36, distance: 4235, x: 0, y: 0 },
		];

		const lapData: TelemetryRow[] = [
			{ distance: 4135, speed: 174 } as TelemetryRow,
			{ distance: 4180, speed: 210 } as TelemetryRow,
			{ distance: 4235, speed: 239 } as TelemetryRow, // at T17
			{ distance: 4280, speed: 260 } as TelemetryRow,
		];

		const result = computeCornerSpeeds(corners, lapData);
		expect(result).toHaveLength(1);
		expect(result[0].corner).toBe(17);
		// Must report 239 (at T17), NOT 174 from 100m earlier!
		expect(result[0].minSpeed).toBe(239);
		expect(result[0].minSpeedDist).toBe(4235);
	});

	it("should compute realistic corner speeds from real Melbourne Qualifying telemetry", async () => {
		const fs = await import("fs");
		const path = await import("path");
		const { parquetReadObjects } = await import("hyparquet");
		const { compressors } = await import("hyparquet-compressors");

		const trackPath = path.resolve("static/tracks/melbourne.json");
		const parquetPath = path.resolve("static/data/2026/f1_2026_rd1_q.parquet");

		if (!fs.existsSync(trackPath) || !fs.existsSync(parquetPath)) {
			return; // Skip if files not present in environment
		}

		const trackJson = JSON.parse(fs.readFileSync(trackPath, "utf-8"));
		const corners: TrackCorner[] = trackJson.corners;
		expect(corners.length).toBeGreaterThan(10);

		const buffer = fs.readFileSync(parquetPath);
		const arrayBuffer = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		);
		const rawRows = (await parquetReadObjects({
			file: arrayBuffer,
			compressors,
		})) as TelemetryRow[];

		// Find a driver with laps
		const driverRows = rawRows.filter((r) => r.driver_number === 1); // Max Verstappen or driver 1
		expect(driverRows.length).toBeGreaterThan(0);

		// Get a complete lap (e.g. lap 3 or 4)
		const lapNumbers = Array.from(new Set(driverRows.map((r) => r.lap_number))).filter(
			(l) => l > 1,
		);
		const testLap = lapNumbers[0];
		const lapSlice = driverRows.filter((r) => r.lap_number === testLap);

		// Normalize distance like TelemetryEngine does
		const startDist = lapSlice[0]?.distance ?? 0;
		const normalizedLap = lapSlice.map((r) => ({
			...r,
			distance: (r.distance ?? 0) - startDist,
		}));

		const results = computeCornerSpeeds(corners, normalizedLap);
		expect(results.length).toBe(corners.length);

		// Verify every corner has realistic F1 speeds
		for (const cs of results) {
			if (cs.minSpeed !== null) {
				// Apex speeds in F1 at Melbourne are between 70 km/h and 280 km/h
				expect(cs.minSpeed).toBeGreaterThan(60);
				expect(cs.minSpeed).toBeLessThan(320);
				expect(cs.minSpeedDist).toBeGreaterThanOrEqual(0);
			}
		}
	});
});

