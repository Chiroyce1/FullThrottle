import { browser } from "$app/environment";
import posthog from "posthog-js";
import type {
	TelemetryRow,
	TelemetryFrameRow,
	TelemetryMeta,
	DriverMeta,
	TrackPoint,
	TrackStatusSegment,
	LapTimingEntry,
	StintEntry,
	ValidLap,
	SectorStatus,
	CompoundType,
} from "$lib/types";

import { isValidCoord, extractTrackPath } from "$lib/telemetry/track";
import { computeLapStats, buildLapIndex } from "$lib/telemetry/lap-stats";
import type { DriverLapStats, LapCompletionEvent } from "$lib/telemetry/lap-stats";
import { applyDynamicNeighborGaps, estimateLapLengthMeters } from "$lib/telemetry/gaps";
import { downsampleTraces } from "$lib/telemetry/downsample";

export interface LoadBenchmark {
	fetchMs: number;
	parseMs: number;
	analysisMs: number;
	totalMs: number;
	rowCount: number;
	driverCount: number;
}

function now(): number {
	return performance.now();
}

type ParquetReadObjectsFn = (args: {
	file: ArrayBuffer;
	compressors: unknown;
}) => Promise<unknown[]>;

let parquetReadObjectsFn: ParquetReadObjectsFn | null = null;
let hyparquetCompressors: unknown = null;
let parquetRuntimePromise: Promise<{
	parquetReadObjects: ParquetReadObjectsFn;
	compressors: unknown;
}> | null = null;

async function getParquetRuntime(): Promise<{
	parquetReadObjects: ParquetReadObjectsFn;
	compressors: unknown;
}> {
	if (!browser) {
		throw new Error(
			"Parquet parsing is only supported in the browser runtime.",
		);
	}

	if (parquetReadObjectsFn && hyparquetCompressors !== null) {
		return {
			parquetReadObjects: parquetReadObjectsFn,
			compressors: hyparquetCompressors,
		};
	}

	if (!parquetRuntimePromise) {
		parquetRuntimePromise = Promise.all([
			import("hyparquet"),
			import("hyparquet-compressors"),
		]).then(([hyparquetModule, compressorsModule]) => {
			parquetReadObjectsFn =
				hyparquetModule.parquetReadObjects as ParquetReadObjectsFn;
			hyparquetCompressors = compressorsModule.compressors;
			parquetRuntimePromise = null;
			return {
				parquetReadObjects: parquetReadObjectsFn,
				compressors: hyparquetCompressors,
			};
		});
	}

	return parquetRuntimePromise;
}

export type SampleRate = 2 | 4 | 8;

export interface PresetOption {
	hz: SampleRate;
	label: string;
	desc: string;
	reduction: string;
}

export const PRESETS: PresetOption[] = [
	{
		hz: 2,
		label: "2 Hz",
		desc: "Choppy telemetry but least memory usage",
		reduction: "~75% less data",
	},
	{
		hz: 4,
		label: "4 Hz",
		desc: "Balanced - smooth with lower memory",
		reduction: "~50% less data",
	},
	{
		hz: 8,
		label: "8 Hz",
		desc: "Full resolution - original data",
		reduction: "No reduction",
	},
];

const FRAME_KEYS: (keyof TelemetryRow)[] = [
	"speed",
	"rpm",
	"throttle",
	"brake",
	"n_gear",
	"drs",
	"lap_number",
	"position",
	"distance",
	"distance_to_driver_ahead",
	"time_gap",
	"compound",
	"stint",
	"tyre_life",
	"track_status",
	"in_pit",
	"x",
	"y",
	"z"
];

export class TelemetryEngine {
	isLoading = $state(false);
	awaitingPreset = $state(false);
	metadata: TelemetryMeta | null = $state(null);
	activeSampleRate: SampleRate = $state(8);

	private pendingParquetUrl = "";
	private pendingMetaUrl = "";

	maxSpeed: number = $state(0);
	uniqueDrivers: string[] = $state([]);
	totalRows: number = $state(0);
	originalRows: number = $state(0);
	minSessionTime: number = $state(Infinity);
	maxSessionTime: number = $state(-Infinity);
	sessionBestLapTime: number = $state(Infinity);

	driverData: Record<string, TelemetryRow[]> = $state.raw({});
	trackPath: TrackPoint[] = $state.raw([]);
	trackStatusTimeline: TrackStatusSegment[] = $state.raw([]);

	benchmark: LoadBenchmark | null = $state(null);

	private cursors: Record<string, number> = {};
	private frameRows: Record<string, TelemetryFrameRow> = {};
	private frameSources: Record<string, TelemetryRow | undefined> = {};
	private firstValidCoordinateIndex: Record<string, number> = {};
	private driverLapStats: Record<string, DriverLapStats> = {};
	private sessionBestTimeline: LapCompletionEvent[] = [];
	private sessionBestCursor = 0;

	private lapIndex: Record<string, Record<number, [number, number]>> = {};
	private lapTelemetryCache: Record<string, Record<number, TelemetryRow[]>> = {};
	private normalizedLapTelemetryCache: Record<
		string,
		Record<number, TelemetryRow[]>
	> = {};
	private estimatedLapLengthMeters = 5000;
	private sectorCrossings: Record<string, Float32Array> = {};

	private activePrepareController: AbortController | null = null;
	private loadToken = 0;
	private activeLoadController: AbortController | null = null;

	get driverList() {
		return this.uniqueDrivers;
	}

	async prepare(parquetUrl: string, metaUrl?: string) {
		if (this.activePrepareController) this.activePrepareController.abort();
		const controller = new AbortController();
		this.activePrepareController = controller;

		this.pendingParquetUrl = parquetUrl;
		this.pendingMetaUrl = metaUrl || parquetUrl.replace(/\.parquet$/i, ".json");
		this.awaitingPreset = true;
		this.metadata = null;

		try {
			const res = await fetch(this.pendingMetaUrl, {
				signal: controller.signal,
			});
			if (res.ok) {
				this.metadata = (await res.json()) as TelemetryMeta;
			}
		} catch (e: unknown) {
			if (controller.signal.aborted) return;
			console.warn("No metadata JSON found alongside the Parquet file.", e);
		} finally {
			if (this.activePrepareController === controller)
				this.activePrepareController = null;
		}
	}

	async load(hz: SampleRate = 8, directUrl?: string, directMetaUrl?: string) {
		if (this.activePrepareController) {
			this.activePrepareController.abort();
			this.activePrepareController = null;
		}

		const token = ++this.loadToken;
		if (this.activeLoadController) this.activeLoadController.abort();
		const controller = new AbortController();
		this.activeLoadController = controller;

		this.awaitingPreset = false;
		this.isLoading = true;
		this.activeSampleRate = hz;
		this.clearSessionData();
		const t0 = now();

		const parquetUrl = directUrl || this.pendingParquetUrl;
		const metaUrl = directMetaUrl || this.pendingMetaUrl;
		if (!parquetUrl) {
			this.isLoading = false;
			throw new Error(
				"No parquet URL provided. Call prepare() first or pass directUrl to load().",
			);
		}

		try {
			if (!this.metadata) {
				try {
					const res = await fetch(metaUrl, { signal: controller.signal });
					if (res.ok) this.metadata = (await res.json()) as TelemetryMeta;
				} catch (e: unknown) {
					if (controller.signal.aborted) return;
					console.warn("No metadata JSON found alongside the Parquet file.", e);
				}
			}

			const tFetch = now();
			const res = await fetch(parquetUrl, { signal: controller.signal });
			if (!res.ok) throw new Error(`Failed to fetch ${parquetUrl}`);
			const buffer = await res.arrayBuffer();
			if (token !== this.loadToken) return;
			const fetchMs = now() - tFetch;

			const tParse = now();
			const { parquetReadObjects, compressors } = await getParquetRuntime();
			let rows = (await parquetReadObjects({
				file: buffer,
				compressors,
			})) as TelemetryRow[];
			if (token !== this.loadToken) {
				// @ts-ignore
				rows = null!;
				return;
			}
			const parseMs = now() - tParse;

			const tAnalysis = now();
			this.originalRows = rows.length;
			const count = rows.length;

			let topSpeed = 0;
			let minTime = Infinity;
			let maxTime = -Infinity;

			const drivers = new Set<string>();
			const grouped: Record<string, TelemetryRow[]> = {};
			const lapPointCounts: Record<string, Record<number, number>> = {};

			let winner = "";
			if (this.metadata?.drivers) {
				const list: DriverMeta[] = Object.values(this.metadata.drivers);
				const p1 = list.find((d: DriverMeta) => d.pos === 1);
				if (p1) winner = p1.driver_number.toString();
			}

			for (let i = 0; i < count; i++) {
				const row = rows[i];
				const speed = row.speed ?? 0;
				const driver = row.driver_number ?? 0;
				const time = row.session_time ?? 0;

				row.speed = speed;
				row.session_time = time;
				row.driver_number = driver;

				if (time > 0 && time < minTime) minTime = time;
				if (time > maxTime) maxTime = time;
				if (speed > topSpeed) topSpeed = speed;

				if (!driver) continue;

				const id = driver.toString();
				drivers.add(id);

				if (!grouped[id]) {
					grouped[id] = [];
				}
				grouped[id].push(row);

				const lap = row.lap_number ?? 0;
				if (lap > 0 && row.x !== undefined && row.y !== undefined) {
					if (!lapPointCounts[id]) lapPointCounts[id] = {};
					lapPointCounts[id][lap] = (lapPointCounts[id][lap] ?? 0) + 1;
				}
			}

			const driverIds = Object.keys(grouped);
			for (let i = 0; i < driverIds.length; i++) {
				grouped[driverIds[i]].sort((a, b) => a.session_time - b.session_time);
			}

			const path = extractTrackPath(grouped, lapPointCounts, winner);

			// @ts-ignore
			rows = null!;

			const { grouped: downsampledGrouped, totalRows: downsampledTotal } =
				downsampleTraces(grouped, hz);
			this.totalRows = downsampledTotal;

			const { lapStats, lapCompletionEvents, sessionBestLap, sectorCrossings } =
				computeLapStats(downsampledGrouped, this.metadata);

			if (token !== this.loadToken) return;

			this.maxSpeed = topSpeed;
			this.minSessionTime = minTime !== Infinity ? minTime : 0;
			this.maxSessionTime = maxTime !== -Infinity ? maxTime : 0;
			this.sessionBestLapTime = sessionBestLap !== Infinity ? sessionBestLap : 0;
			this.uniqueDrivers = Array.from(drivers).sort();

			this.lapIndex = buildLapIndex(downsampledGrouped);
			this.lapTelemetryCache = {};
			this.normalizedLapTelemetryCache = {};
			this.driverLapStats = lapStats;
			this.sessionBestTimeline = lapCompletionEvents;
			this.sessionBestCursor = 0;
			this.driverData = downsampledGrouped;
			this.estimatedLapLengthMeters = estimateLapLengthMeters(downsampledGrouped);
			this.trackPath = path;
			this.cursors = {};
			this.frameRows = {};
			this.frameSources = {};
			this.firstValidCoordinateIndex = this.buildFirstValidCoordinateIndex(downsampledGrouped);
			this.sectorCrossings = sectorCrossings;

			const timelineId = winner || (this.uniqueDrivers[0] ?? "");
			if (timelineId && downsampledGrouped[timelineId]) {
				this.trackStatusTimeline = this.buildStatusTimeline(
					downsampledGrouped[timelineId],
				);
			}

			const analysisMs = now() - tAnalysis;

			this.benchmark = {
				fetchMs: Math.round(fetchMs * 100) / 100,
				parseMs: Math.round(parseMs * 100) / 100,
				analysisMs: Math.round(analysisMs * 100) / 100,
				totalMs: Math.round((now() - t0) * 100) / 100,
				rowCount: this.totalRows,
				driverCount: this.uniqueDrivers.length,
			};

			const sessionLabel = this.metadata?.session_info
				? `${this.metadata.session_info.year ?? ""} ${this.metadata.session_info.name} ${this.metadata.session_info.type}`
				: parquetUrl;
			console.log(
				`[TelemetryEngine] Loaded "${sessionLabel}" — ${this.uniqueDrivers.length} drivers, ${this.totalRows.toLocaleString()} rows in ${this.benchmark.totalMs}ms`,
			);

			posthog.capture("session_loaded", {
				session: sessionLabel,
				hz,
				drivers: this.uniqueDrivers.length,
				rows: this.totalRows,
				fetchMs: this.benchmark.fetchMs,
				parseMs: this.benchmark.parseMs,
				analysisMs: this.benchmark.analysisMs,
				totalMs: this.benchmark.totalMs,
			});
		} catch (error: unknown) {
			if (controller.signal.aborted) return;
			console.error("Error loading telemetry data:", error);
		} finally {
			if (token === this.loadToken) this.isLoading = false;
			if (this.activeLoadController === controller)
				this.activeLoadController = null;
		}
	}

	getFrame(target: number): Record<string, TelemetryFrameRow> {
		const out: Record<string, TelemetryFrameRow> = {};
		const list = this.uniqueDrivers;
		const currentSessionBest = this.getSessionBestAt(target);

		for (let i = 0; i < list.length; i++) {
			const id = list[i];
			const trace = this.driverData[id];
			const stats = this.driverLapStats[id];
			if (!trace || trace.length === 0) continue;

			let c = this.cursors[id] || 0;

			while (c < trace.length - 1 && trace[c + 1].session_time <= target) c++;
			while (c > 0 && trace[c].session_time > target) c--;

			this.cursors[id] = c;
			const row = trace[c];
			const firstValidIdx = this.firstValidCoordinateIndex[id] ?? -1;
			const coordinateIndex = this.resolveCoordinateIndex(
				trace,
				c,
				firstValidIdx,
			);
			const coordinateRow = trace[coordinateIndex] ?? row;

			let x = coordinateRow.x ?? row.x ?? 0;
			let y = coordinateRow.y ?? row.y ?? 0;
			let z = coordinateRow.z ?? row.z ?? 0;

			if (
				coordinateIndex === c &&
				isValidCoord(row.x, row.y) &&
				c < trace.length - 1
			) {
				const next = trace[c + 1];
				if (isValidCoord(next.x, next.y)) {
					const t0 = row.session_time;
					const t1 = next.session_time;

					if (t1 > t0 && t1 - t0 < 2.0 && target >= t0 && target <= t1) {
						const p = (target - t0) / (t1 - t0);
						x += ((next.x ?? x) - x) * p;
						y += ((next.y ?? y) - y) * p;
						z += ((next.z ?? z) - z) * p;
					}
				}
			}

			let frameRow = this.frameRows[id];
			if (!frameRow) {
				frameRow = { ...row };
				this.frameRows[id] = frameRow;
				this.frameSources[id] = undefined;
			}

			if (this.frameSources[id] !== row) {
				for (const key of FRAME_KEYS) {
					// @ts-ignore
					frameRow[key] = row[key];
				}
				this.frameSources[id] = row;
			}

			const lastLap = stats ? this.readLapValue(stats.lastLapTimes, c) : null;
			const bestLap = stats ? this.readLapValue(stats.bestLapTimes, c) : null;
			const lapStart = stats ? this.readLapValue(stats.lapStartTimes, c) : null;

			const s1 = stats ? stats.sector1States[c] : 0;
			const s2 = stats ? stats.sector2States[c] : 0;
			const s3 = stats ? stats.sector3States[c] : 0;
			const s1t = stats ? this.readLapValue(stats.sector1Times, c) : null;
			const s2t = stats ? this.readLapValue(stats.sector2Times, c) : null;
			const s3t = stats ? this.readLapValue(stats.sector3Times, c) : null;
			const stateMap: SectorStatus[] = ["none", "yellow", "green", "purple"];

			frameRow.x = x;
			frameRow.y = y;
			frameRow.z = z;
			frameRow.session_time = target;
			frameRow._cached_last_lap = lastLap;
			frameRow._cached_best_lap = bestLap;
			frameRow._cached_current_lap =
				lapStart !== null ? Math.max(0, target - lapStart) : null;
			frameRow._is_purple =
				bestLap !== null &&
				currentSessionBest !== null &&
				Math.abs(bestLap - currentSessionBest) < 0.001;
			frameRow._sector1_state = stateMap[s1];
			frameRow._sector2_state = stateMap[s2];
			frameRow._sector3_state = stateMap[s3];
			frameRow._sector1_time = s1t;
			frameRow._sector2_time = s2t;
			frameRow._sector3_time = s3t;

			this.frameRows[id] = frameRow;
			out[id] = frameRow;
		}

		applyDynamicNeighborGaps(out, this.estimatedLapLengthMeters, this.sectorCrossings);

		return out;
	}

	clearSessionData() {
		this.maxSpeed = 0;
		this.uniqueDrivers = [];
		this.totalRows = 0;
		this.originalRows = 0;
		this.minSessionTime = Infinity;
		this.maxSessionTime = -Infinity;
		this.sessionBestLapTime = Infinity;
		this.driverData = {};
		this.trackPath = [];
		this.trackStatusTimeline = [];
		this.benchmark = null;
		this.cursors = {};
		this.frameRows = {};
		this.frameSources = {};
		this.firstValidCoordinateIndex = {};
		this.driverLapStats = {};
		this.sessionBestTimeline = [];
		this.sessionBestCursor = 0;
		this.lapIndex = {};
		this.lapTelemetryCache = {};
		this.normalizedLapTelemetryCache = {};
		this.estimatedLapLengthMeters = 5000;
		this.sectorCrossings = {};
	}

	dispose() {
		if (this.activePrepareController) {
			this.activePrepareController.abort();
			this.activePrepareController = null;
		}

		this.loadToken++;
		if (this.activeLoadController) {
			this.activeLoadController.abort();
			this.activeLoadController = null;
		}
		this.clearSessionData();
		this.metadata = null;
		this.pendingParquetUrl = "";
		this.pendingMetaUrl = "";
		this.awaitingPreset = false;
		this.isLoading = false;
	}

	getLapTelemetry(id: string, lap: number): TelemetryRow[] {
		const cached = this.lapTelemetryCache[id]?.[lap];
		if (cached) return cached;

		const range = this.lapIndex[id]?.[lap];
		if (!range) return [];

		const trace = this.driverData[id].slice(range[0], range[1] + 1);
		if (!this.lapTelemetryCache[id]) this.lapTelemetryCache[id] = {};
		this.lapTelemetryCache[id][lap] = trace;
		return trace;
	}

	getNormalizedLapTelemetry(id: string, lap: number): TelemetryRow[] {
		const cached = this.normalizedLapTelemetryCache[id]?.[lap];
		if (cached) return cached;

		const trace = this.getLapTelemetry(id, lap);
		if (trace.length === 0) return [];

		const startDistance = trace[0]?.distance ?? 0;
		const normalized = trace.map((row) => ({
			...row,
			distance: (row.distance ?? 0) - startDistance,
		}));

		if (!this.normalizedLapTelemetryCache[id])
			this.normalizedLapTelemetryCache[id] = {};
		this.normalizedLapTelemetryCache[id][lap] = normalized;
		return normalized;
	}

	getDriverLapTimes(id: string): LapTimingEntry[] {
		const trace = this.driverData[id];
		if (!trace || trace.length === 0) return [];

		const validLapsMap = new Map<number, ValidLap>();
		const vLaps = this.metadata?.drivers?.[id]?.valid_laps || [];
		for (const v of vLaps) {
			validLapsMap.set(v.lap_number, v);
		}

		const lapsByNumber = new Map<number, LapTimingEntry>();
		let current = trace[0].lap_number || 0;
		let start = trace[0].session_time;

		for (let i = 1; i < trace.length; i++) {
			const row = trace[i];
			const lap = row.lap_number || 0;
			if (lap > current && current > 0) {
				const prev = trace[i - 1];

				let lapTime = row.session_time - start;
				const vLap = validLapsMap.get(current);
				if (vLap) {
					lapTime = vLap.lap_time;
				}

				lapsByNumber.set(current, {
					lap: current,
					time: lapTime,
					compound: vLap
						? (vLap.compound as CompoundType)
						: prev.compound || "UNKNOWN",
					stint: prev.stint || 0,
					tyreLife:
						vLap && vLap.tyre_life !== undefined
							? vLap.tyre_life
							: prev.tyre_life || 0,
				});
				start = row.session_time;
			}
			current = lap;
		}

		const lapRanges = this.lapIndex[id] || {};
		for (const lapNumberText of Object.keys(lapRanges)) {
			const lapNumber = Number(lapNumberText);
			if (!Number.isFinite(lapNumber) || lapNumber <= 0) continue;
			if (lapsByNumber.has(lapNumber)) continue;

			const range = lapRanges[lapNumber];
			const endRow = trace[range[1]] || trace[range[0]];
			if (!endRow) continue;

			const vLap = validLapsMap.get(lapNumber);
			lapsByNumber.set(lapNumber, {
				lap: lapNumber,
				time: vLap?.lap_time ?? 0,
				compound: vLap
					? (vLap.compound as CompoundType)
					: endRow.compound || "UNKNOWN",
				stint: endRow.stint || 0,
				tyreLife:
					vLap && vLap.tyre_life !== undefined
						? vLap.tyre_life
						: endRow.tyre_life || 0,
			});
		}

		const laps = [...lapsByNumber.values()].sort((a, b) => a.lap - b.lap);

		const officialBest = this.getOfficialQualifyingBestLap(id);
		if (officialBest !== null) {
			let bestIndex = -1;
			let bestTime = Infinity;
			for (let i = 0; i < laps.length; i++) {
				const t = laps[i].time;
				if (t > 20 && t < 300 && t < bestTime) {
					bestTime = t;
					bestIndex = i;
				}
			}
			if (bestIndex >= 0) {
				laps[bestIndex].time = officialBest;
			}
		}

		return laps;
	}

	getDriverStints(id: string): StintEntry[] {
		const trace = this.driverData[id];
		if (!trace || trace.length === 0) return [];

		const stints: StintEntry[] = [];
		let stint = trace[0].stint ?? 0;
		let compound = trace[0].compound || "UNKNOWN";
		let startLap = trace[0].lap_number || 1;

		for (let i = 1; i < trace.length; i++) {
			const row = trace[i];
			const s = row.stint ?? 0;
			if (s !== stint) {
				const endLap = trace[i - 1].lap_number || startLap;
				stints.push({
					stint,
					compound,
					startLap,
					endLap,
					laps: endLap - startLap + 1,
				});
				stint = s;
				compound = row.compound || "UNKNOWN";
				startLap = row.lap_number || endLap + 1;
			}
		}

		const last = trace[trace.length - 1];
		const endLap = last.lap_number || startLap;
		stints.push({
			stint,
			compound,
			startLap,
			endLap,
			laps: endLap - startLap + 1,
		});

		return stints;
	}

	private buildStatusTimeline(trace: TelemetryRow[]): TrackStatusSegment[] {
		if (trace.length === 0) return [];

		const segments: TrackStatusSegment[] = [];
		let status = trace[0].track_status ?? 1;
		let start = trace[0].session_time ?? 0;

		for (let i = 1; i < trace.length; i++) {
			const s = trace[i].track_status ?? 1;
			if (s !== status) {
				segments.push({ start, end: trace[i].session_time, status });
				status = s;
				start = trace[i].session_time;
			}
		}

		segments.push({
			start,
			end: trace[trace.length - 1]?.session_time ?? start,
			status,
		});
		return segments;
	}

	private buildFirstValidCoordinateIndex(
		grouped: Record<string, TelemetryRow[]>,
	): Record<string, number> {
		const out: Record<string, number> = {};

		for (const id of Object.keys(grouped)) {
			const trace = grouped[id];
			let first = -1;
			for (let i = 0; i < trace.length; i++) {
				if (isValidCoord(trace[i].x, trace[i].y)) {
					first = i;
					break;
				}
			}
			out[id] = first;
		}

		return out;
	}

	private resolveCoordinateIndex(
		trace: TelemetryRow[],
		index: number,
		firstValidIndex: number,
	): number {
		if (trace.length === 0) return 0;
		if (index < 0) index = 0;
		if (index >= trace.length) index = trace.length - 1;

		if (isValidCoord(trace[index]?.x, trace[index]?.y)) {
			return index;
		}

		if (firstValidIndex >= 0 && index < firstValidIndex) {
			return index;
		}

		for (let i = index - 1; i >= 0; i--) {
			if (isValidCoord(trace[i].x, trace[i].y)) return i;
		}

		for (let i = index + 1; i < trace.length; i++) {
			if (isValidCoord(trace[i].x, trace[i].y)) return i;
		}

		return index;
	}

	private getSessionBestAt(target: number): number | null {
		const timeline = this.sessionBestTimeline;
		if (timeline.length === 0) return null;

		let cursor = this.sessionBestCursor;
		while (cursor < timeline.length - 1 && timeline[cursor + 1].time <= target)
			cursor++;
		while (cursor > 0 && timeline[cursor].time > target) cursor--;
		this.sessionBestCursor = cursor;

		return timeline[cursor].time <= target ? timeline[cursor].duration : null;
	}

	private readLapValue(values: Float32Array, index: number): number | null {
		const value = values[index];
		return Number.isNaN(value) ? null : value;
	}

	private getOfficialQualifyingBestLap(driverId: string): number | null {
		const sessionType = this.metadata?.session_info?.type?.toLowerCase() ?? "";
		const sessionCode =
			(
				this.metadata?.session_info as { session_code?: string } | undefined
			)?.session_code?.toLowerCase() ?? "";
		const isQualifying =
			sessionType.includes("qual") ||
			sessionCode === "q" ||
			sessionCode === "sq";
		if (!isQualifying) return null;

		const q = this.metadata?.qualifying?.[driverId];
		if (!q) return null;

		const candidates = [q.q1, q.q2, q.q3].filter(
			(v): v is number => v !== null && Number.isFinite(v) && v > 0 && v < 300,
		);

		if (candidates.length === 0) return null;
		return Math.min(...candidates);
	}
}
