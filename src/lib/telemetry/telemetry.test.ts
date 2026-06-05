import { describe, expect, it, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

import type {
	TelemetryRow,
	TelemetryMeta,
	TelemetryFrameRow,
} from "$lib/types";
import { isValidCoord, extractTrackPath } from "./track";
import { computeLapStats, buildLapIndex } from "./lap-stats";
import { applyDynamicNeighborGaps, estimateLapLengthMeters } from "./gaps";
import { downsampleTraces } from "./downsample";

describe("Telemetry Coordinate Validation", () => {
	it("should flag invalid or incomplete coordinates", () => {
		expect(isValidCoord(undefined, 10)).toBe(false);
		expect(isValidCoord(10, undefined)).toBe(false);
		expect(isValidCoord(Number.NaN, 5)).toBe(false);
		expect(isValidCoord(5, Number.POSITIVE_INFINITY)).toBe(false);
		expect(isValidCoord(0, 0)).toBe(false);
	});

	it("should accept valid coordinates", () => {
		expect(isValidCoord(10.5, -4.2)).toBe(true);
		expect(isValidCoord(0.0001, 0.0001)).toBe(true);
	});
});

const TEST_SESSIONS = [
	// trying to use a wide variety of sessions
	{ year: "2026", file: "f1_2026_rd1_q" }, // Melbourne Qualifying (2026)
	{ year: "2026", file: "f1_2026_rd2_s" }, // Shanghai Sprint (2026)
	{ year: "2025", file: "f1_2025_rd1_r" }, // Melbourne Race (2025)
	{ year: "2025", file: "f1_2025_rd8_r" }, // Monaco Race (2025)
	{ year: "2025", file: "f1_2025_rd22_q" }, // Las Vegas Qualifying (2025)
];

const EXPECTED_LAP_LENGTHS: Record<string, number> = {
	f1_2026_rd1_q: 5548.06, // Melbourne (Qualifying 2026)
	f1_2026_rd2_s: 9771.0, // Shanghai Sprint (Double-lap / out-lap cumulative telemetry)
	f1_2025_rd1_r: 5418.24, // Melbourne (Race 2025)
	f1_2025_rd8_r: 6671.91, // Monaco (Double-lap telemetry)
	f1_2025_rd22_q: 5876.96, // Las Vegas (Qualifying 2025)
};

describe.each(TEST_SESSIONS)(
	"Telemetry Algorithms for $file",
	({ year, file }) => {
		let rawRows: TelemetryRow[] = [];
		let metadata: TelemetryMeta | null = null;
		let groupedDrivers: Record<string, TelemetryRow[]> = {};
		let lapPointCounts: Record<string, Record<number, number>> = {};
		let winnerId = "";

		beforeAll(async () => {
			const parquetPath = path.resolve(`static/data/${year}/${file}.parquet`);
			const jsonPath = path.resolve(`static/data/${year}/${file}.json`);

			expect(fs.existsSync(parquetPath)).toBe(true);
			expect(fs.existsSync(jsonPath)).toBe(true);

			metadata = JSON.parse(
				fs.readFileSync(jsonPath, "utf-8"),
			) as TelemetryMeta;
			expect(metadata).not.toBeNull();

			if (metadata.drivers) {
				const list = Object.values(metadata.drivers);
				const p1 = list.find((d) => d.pos === 1);
				if (p1) winnerId = p1.driver_number.toString();
			}

			const buffer = fs.readFileSync(parquetPath);
			const arrayBuffer = buffer.buffer.slice(
				buffer.byteOffset,
				buffer.byteOffset + buffer.byteLength,
			);
			rawRows = (await parquetReadObjects({
				file: arrayBuffer,
				compressors,
			})) as TelemetryRow[];

			expect(rawRows.length).toBeGreaterThan(0);

			for (let i = 0; i < rawRows.length; i++) {
				const row = rawRows[i];
				row.speed = row.speed ?? 0;
				row.session_time = row.session_time ?? 0;
				row.driver_number = row.driver_number ?? 0;

				if (!row.driver_number) continue;

				const id = row.driver_number.toString();
				if (!groupedDrivers[id]) {
					groupedDrivers[id] = [];
				}
				groupedDrivers[id].push(row);

				const lap = row.lap_number ?? 0;
				if (lap > 0 && row.x !== undefined && row.y !== undefined) {
					if (!lapPointCounts[id]) lapPointCounts[id] = {};
					lapPointCounts[id][lap] = (lapPointCounts[id][lap] ?? 0) + 1;
				}
			}

			for (const id of Object.keys(groupedDrivers)) {
				groupedDrivers[id].sort((a, b) => a.session_time - b.session_time);
			}
		});

		it("should extract track path from the session", () => {
			const pathPoints = extractTrackPath(
				groupedDrivers,
				lapPointCounts,
				winnerId,
			);
			expect(pathPoints.length).toBeGreaterThan(0);

			for (const pt of pathPoints) {
				expect(Number.isFinite(pt.x)).toBe(true);
				expect(Number.isFinite(pt.y)).toBe(true);
				expect(pt.x).not.toBe(0);
				expect(pt.y).not.toBe(0);
			}
		});

		it("should handle empty or fallback cases gracefully for track extraction", () => {
			const emptyGrouped: Record<string, TelemetryRow[]> = {};
			const emptyCounts: Record<string, Record<number, number>> = {};
			const fallbackPath = extractTrackPath(emptyGrouped, emptyCounts, "44");
			expect(fallbackPath).toEqual([]);
		});

		it("should downsample traces based on Hz settings", () => {
			const cloned = { ...groupedDrivers };
			const originalTotal = Object.values(cloned).reduce(
				(sum, list) => sum + list.length,
				0,
			);

			const { grouped: downsampled, totalRows } = downsampleTraces(cloned, 2);
			expect(totalRows).toBeLessThanOrEqual(originalTotal);

			for (const id of Object.keys(groupedDrivers)) {
				const orig = groupedDrivers[id];
				const ds = downsampled[id];
				if (orig.length > 0 && ds.length > 0) {
					expect(ds[0].session_time).toBe(orig[0].session_time);
					expect(ds[ds.length - 1].session_time).toBe(
						orig[orig.length - 1].session_time,
					);
				}
			}
		});

		it("should preserve lap transition boundaries during downsampling", () => {
			const mockTrace: TelemetryRow[] = [
				{ session_time: 1.0, lap_number: 1 } as TelemetryRow,
				{ session_time: 2.0, lap_number: 1 } as TelemetryRow,
				{ session_time: 3.0, lap_number: 1 } as TelemetryRow,
				{ session_time: 4.0, lap_number: 2 } as TelemetryRow,
				{ session_time: 5.0, lap_number: 2 } as TelemetryRow,
				{ session_time: 6.0, lap_number: 2 } as TelemetryRow,
			];

			const grouped = { "44": mockTrace };
			const { grouped: dsGrouped } = downsampleTraces(grouped, 4); // Step of 2
			const dsTrace = dsGrouped["44"];

			const lap1Last = dsTrace.find((r) => r.session_time === 3.0);
			const lap2First = dsTrace.find((r) => r.session_time === 4.0);
			expect(lap1Last).toBeDefined();
			expect(lap2First).toBeDefined();
		});

		it("should make no changes if 8 Hz is specified during downsampling", () => {
			const cloned = { ...groupedDrivers };
			const originalTotal = Object.values(cloned).reduce(
				(sum, list) => sum + list.length,
				0,
			);
			const { totalRows } = downsampleTraces(cloned, 8);
			expect(totalRows).toBe(originalTotal);
		});

		it("should compute lap stats and build lap index for the session", () => {
			const { lapStats, lapCompletionEvents, sessionBestLap, sectorCrossings } =
				computeLapStats(groupedDrivers, metadata);

			expect(sessionBestLap).toBeGreaterThan(0);
			expect(lapCompletionEvents.length).toBeGreaterThan(0);

			for (let i = 1; i < lapCompletionEvents.length; i++) {
				expect(lapCompletionEvents[i].time).toBeGreaterThanOrEqual(
					lapCompletionEvents[i - 1].time,
				);
			}

			for (const id of Object.keys(groupedDrivers)) {
				const stats = lapStats[id];
				const traceLength = groupedDrivers[id].length;

				expect(stats).toBeDefined();
				expect(stats.lastLapTimes.length).toBe(traceLength);
				expect(stats.bestLapTimes.length).toBe(traceLength);
				expect(stats.sector1States.length).toBe(traceLength);
				expect(stats.sector1Times.length).toBe(traceLength);

				const crossings = sectorCrossings[id];
				expect(crossings).toBeDefined();
				expect(crossings.length).toBe(120 * 3 + 1);
			}

			const lapIndex = buildLapIndex(groupedDrivers);
			for (const id of Object.keys(groupedDrivers)) {
				const index = lapIndex[id];
				const trace = groupedDrivers[id];
				expect(index).toBeDefined();

				for (const lapNumStr of Object.keys(index)) {
					const [start, end] = index[Number(lapNumStr)];
					expect(start).toBeLessThanOrEqual(end);
					expect(start).toBeGreaterThanOrEqual(0);
					expect(end).toBeLessThan(trace.length);
				}
			}
		});

		it("should estimate average lap length correctly", () => {
			const estLength = estimateLapLengthMeters(groupedDrivers);
			const expected = EXPECTED_LAP_LENGTHS[file];
			expect(expected).toBeDefined();
			expect(estLength).toBeCloseTo(expected, 1);
		});

		it("should calculate correct dynamic gaps between neighboring drivers using real session data", () => {
			const { sectorCrossings } = computeLapStats(groupedDrivers, metadata);
			const estLength = estimateLapLengthMeters(groupedDrivers);

			// Find a session time when multiple drivers are active on track
			let targetTime = 0;
			const driverIds = Object.keys(groupedDrivers);

			for (const id of driverIds) {
				const trace = groupedDrivers[id];
				if (trace.length > 20) {
					const midRow = trace[Math.floor(trace.length / 2)];
					const t = midRow.session_time;

					let activeCount = 0;
					for (const otherId of driverIds) {
						const otherTrace = groupedDrivers[otherId];
						const hasTime = otherTrace.some(
							(r) => Math.abs(r.session_time - t) < 5.0,
						);
						if (hasTime) activeCount++;
					}
					if (activeCount >= 3) {
						targetTime = t;
						break;
					}
				}
			}

			if (!targetTime) {
				targetTime = groupedDrivers[driverIds[0]]?.[0]?.session_time ?? 1000;
			}

			// Build a real frame for this targetTime from the actual telemetry rows
			const frame: Record<string, TelemetryFrameRow> = {};
			for (const id of driverIds) {
				const trace = groupedDrivers[id];
				let closestRow = trace[0];
				let minDist = Infinity;
				for (const r of trace) {
					const diff = Math.abs(r.session_time - targetTime);
					if (diff < minDist) {
						minDist = diff;
						closestRow = r;
					}
				}
				if (minDist < 5.0) {
					frame[id] = {
						...closestRow,
						distance_to_driver_ahead: -1,
						time_gap: undefined,
						gap_to_leader: undefined,
					} as TelemetryFrameRow;
				}
			}

			expect(Object.keys(frame).length).toBeGreaterThanOrEqual(1);

			// Run the gap calculation using the actual telemetry data
			applyDynamicNeighborGaps(frame, estLength, sectorCrossings);

			const entries = Object.values(frame);
			const ranked = entries.filter(
				(row) => (row.position ?? 0) > 0 && Number.isFinite(row.distance),
			);

			if (ranked.length > 1) {
				ranked.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

				const leader = ranked[0];
				expect(leader.time_gap).toBe(0);
				expect(leader.gap_to_leader).toBe(0);

				for (let i = 1; i < ranked.length; i++) {
					const row = ranked[i];
					if (row.time_gap !== undefined) {
						expect(row.time_gap).toBeGreaterThanOrEqual(0);
					}
					if (row.gap_to_leader !== undefined) {
						expect(row.gap_to_leader).toBeGreaterThanOrEqual(0);
					}
				}
			}
		});
	},
);
