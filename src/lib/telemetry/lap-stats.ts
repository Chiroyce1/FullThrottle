import type { TelemetryRow, TelemetryMeta, ValidLap } from "$lib/types";

export interface DriverLapStats {
	lastLapTimes: Float32Array;
	bestLapTimes: Float32Array;
	lapStartTimes: Float32Array;
	sector1States: Int8Array;
	sector2States: Int8Array;
	sector3States: Int8Array;
	sector1Times: Float32Array;
	sector2Times: Float32Array;
	sector3Times: Float32Array;
}

export interface LapCompletionEvent {
	time: number;
	duration: number;
}

function allocateDriverArrays(count: number): DriverLapStats {
	return {
		lastLapTimes: new Float32Array(count).fill(Number.NaN),
		bestLapTimes: new Float32Array(count).fill(Number.NaN),
		lapStartTimes: new Float32Array(count).fill(Number.NaN),
		sector1States: new Int8Array(count).fill(0),
		sector2States: new Int8Array(count).fill(0),
		sector3States: new Int8Array(count).fill(0),
		sector1Times: new Float32Array(count).fill(Number.NaN),
		sector2Times: new Float32Array(count).fill(Number.NaN),
		sector3Times: new Float32Array(count).fill(Number.NaN),
	};
}

export function computeLapStats(
	grouped: Record<string, TelemetryRow[]>,
	metadata: TelemetryMeta | null,
): {
	lapStats: Record<string, DriverLapStats>;
	lapCompletionEvents: LapCompletionEvent[];
	sessionBestLap: number;
	sectorCrossings: Record<string, Float32Array>;
} {
	const lapStats: Record<string, DriverLapStats> = {};
	const lapCompletionEvents: LapCompletionEvent[] = [];
	let sessionBestLap = Infinity;

	// Gather lap start times from telemetry to anchor valid laps from metadata
	const driverLapAnchors: Record<string, Record<number, number>> = {};
	for (const id of Object.keys(grouped)) {
		const trace = grouped[id];
		driverLapAnchors[id] = {};
		let currentLap = 0;
		for (const row of trace) {
			const lap = row.lap_number;
			const time = row.session_time;
			if (lap === undefined || time === undefined) continue;
			if (lap > 0 && lap > currentLap) {
				driverLapAnchors[id][lap] = time;
				currentLap = lap;
			}
		}
	}

	interface SectorEvent {
		id: string;
		lap: number;
		timeAbs: number;
		part: 1 | 2 | 3;
		duration: number;
	}
	const sectorEvents: SectorEvent[] = [];
	const vLapsMeta: Record<string, ValidLap[]> = {};

	for (const id of Object.keys(grouped)) {
		vLapsMeta[id] = metadata?.drivers?.[id]?.valid_laps || [];
		const anchors = driverLapAnchors[id];
		for (const vLap of vLapsMeta[id]) {
			const s1 = vLap.sector1;
			const s2 = vLap.sector2;
			const s3 = vLap.sector3;
			const lapStart = anchors[vLap.lap_number];
			if (lapStart === undefined) continue;

			sectorEvents.push(
				{ id, lap: vLap.lap_number, timeAbs: lapStart + s1, part: 1, duration: s1 },
				{ id, lap: vLap.lap_number, timeAbs: lapStart + s1 + s2, part: 2, duration: s2 },
				{ id, lap: vLap.lap_number, timeAbs: lapStart + s1 + s2 + s3, part: 3, duration: s3 },
			);
		}
	}

	// Sort events chronologically to track overall session bests correctly
	sectorEvents.sort((a, b) => a.timeAbs - b.timeAbs);

	const personalBests = {
		1: {} as Record<string, number>,
		2: {} as Record<string, number>,
		3: {} as Record<string, number>,
	};
	const overallBests = { 1: Infinity, 2: Infinity, 3: Infinity };

	// Map driverId -> lapNumber -> sectorPart (1,2,3) -> status code (1=yellow, 2=green, 3=purple)
	const sectorStatesByLap: Record<string, Record<number, Record<number, number>>> = {};

	for (const ev of sectorEvents) {
		const { id, lap, part, duration } = ev;
		let state = 1;

		let isPersonalBest = false;
		let isOverallBest = false;

		if (!personalBests[part][id] || duration < personalBests[part][id]) {
			personalBests[part][id] = duration;
			isPersonalBest = true;
		}

		if (duration < overallBests[part]) {
			overallBests[part] = duration;
			isOverallBest = true;
		}

		if (isOverallBest) {
			state = 3;
		} else if (isPersonalBest) {
			state = 2;
		}

		if (!sectorStatesByLap[id]) sectorStatesByLap[id] = {};
		if (!sectorStatesByLap[id][lap]) sectorStatesByLap[id][lap] = {};
		sectorStatesByLap[id][lap][part] = state;
	}

	const maxLaps = 120;
	const arraySize = maxLaps * 3 + 1;
	const sectorCrossings: Record<string, Float32Array> = {};

	for (const id of Object.keys(grouped)) {
		const trace = grouped[id];
		const count = trace.length;
		const stats = allocateDriverArrays(count);

		const vLaps = vLapsMeta[id] || [];
		const vLapsMap = new Map<number, ValidLap>();
		let driverBestLap = Infinity;

		sectorCrossings[id] = new Float32Array(arraySize).fill(0);
		const anchors = driverLapAnchors[id] || {};

		for (const vLap of vLaps) {
			vLapsMap.set(vLap.lap_number, vLap);
			const lapStart = anchors[vLap.lap_number];
			if (lapStart !== undefined && vLap.lap_number < maxLaps) {
				const baseIdx = vLap.lap_number * 3;
				sectorCrossings[id][baseIdx + 1] = lapStart + vLap.sector1;
				sectorCrossings[id][baseIdx + 2] = lapStart + vLap.sector1 + vLap.sector2;
				sectorCrossings[id][baseIdx + 3] = lapStart + vLap.lap_time;
			}
		}

		let currentLap = 0;
		let lapStart = Number.NaN;
		let lastLapTime = Number.NaN;

		for (let i = 0; i < count; i++) {
			const row = trace[i];
			const lap = row.lap_number;
			const time = row.session_time;

			if (lap === undefined || time === undefined) {
				stats.lastLapTimes[i] = lastLapTime;
				stats.bestLapTimes[i] = driverBestLap !== Infinity ? driverBestLap : Number.NaN;
				continue;
			}

			if (lap > 0) {
				if (currentLap === 0) {
					currentLap = lap;
					lapStart = time;
				} else if (lap > currentLap) {
					const completedVLap = vLapsMap.get(currentLap);
					if (completedVLap) {
						lastLapTime = completedVLap.lap_time;
						if (lastLapTime < driverBestLap) driverBestLap = lastLapTime;
						if (lastLapTime < sessionBestLap) sessionBestLap = lastLapTime;
						lapCompletionEvents.push({ time, duration: driverBestLap });
					} else {
						const duration = time - lapStart;
						if (duration > 20 && duration < 300) {
							lastLapTime = duration;
							if (duration < driverBestLap) driverBestLap = duration;
							if (duration < sessionBestLap) sessionBestLap = duration;
							lapCompletionEvents.push({ time, duration: driverBestLap });
						}
					}

					currentLap = lap;
					lapStart = time;
				}

				stats.lapStartTimes[i] = lapStart;

				let currentS1State = 0;
				let currentS2State = 0;
				let currentS3State = 0;
				let currentS1Time = Number.NaN;
				let currentS2Time = Number.NaN;
				let currentS3Time = Number.NaN;

				const vLap = vLapsMap.get(currentLap);
				const states = sectorStatesByLap[id]?.[currentLap];

				if (vLap && states) {
					const elapsed = time - lapStart;

					if (elapsed < vLap.sector1) {
						const prevVLap = vLapsMap.get(currentLap - 1);
						if (prevVLap) {
							currentS1Time = prevVLap.sector1;
							currentS2Time = prevVLap.sector2;
							currentS3Time = prevVLap.sector3;
						}
						const prevStates = sectorStatesByLap[id]?.[currentLap - 1];
						if (prevStates) {
							currentS1State = prevStates[1] || 0;
							currentS2State = prevStates[2] || 0;
							currentS3State = prevStates[3] || 0;
						}
					} else {
						currentS1State = states[1] || 0;
						currentS1Time = vLap.sector1;
						if (elapsed >= vLap.sector1 + vLap.sector2) {
							currentS2State = states[2] || 0;
							currentS2Time = vLap.sector2;
						}
						if (elapsed >= vLap.lap_time) {
							currentS3State = states[3] || 0;
							currentS3Time = vLap.sector3;
						}
					}
				}

				stats.sector1States[i] = currentS1State;
				stats.sector2States[i] = currentS2State;
				stats.sector3States[i] = currentS3State;
				stats.sector1Times[i] = currentS1Time;
				stats.sector2Times[i] = currentS2Time;
				stats.sector3Times[i] = currentS3Time;
			}

			stats.lastLapTimes[i] = lastLapTime;
			stats.bestLapTimes[i] = driverBestLap !== Infinity ? driverBestLap : Number.NaN;
		}

		lapStats[id] = stats;
	}

	lapCompletionEvents.sort((a, b) => a.time - b.time);
	let rollingBest = Infinity;
	for (let i = 0; i < lapCompletionEvents.length; i++) {
		rollingBest = Math.min(rollingBest, lapCompletionEvents[i].duration);
		lapCompletionEvents[i].duration = rollingBest;
	}

	return { lapStats, lapCompletionEvents, sessionBestLap, sectorCrossings };
}

export function buildLapIndex(
	grouped: Record<string, TelemetryRow[]>,
): Record<string, Record<number, [number, number]>> {
	const index: Record<string, Record<number, [number, number]>> = {};

	for (const id of Object.keys(grouped)) {
		const trace = grouped[id];
		const laps: Record<number, [number, number]> = {};
		if (trace.length === 0) continue;

		let currentLap = trace[0].lap_number ?? 0;
		let lapStart = 0;

		for (let i = 1; i < trace.length; i++) {
			const lap = trace[i].lap_number ?? 0;
			if (lap !== currentLap) {
				if (currentLap > 0) laps[currentLap] = [lapStart, i - 1];
				currentLap = lap;
				lapStart = i;
			}
		}

		if (currentLap > 0) laps[currentLap] = [lapStart, trace.length - 1];
		index[id] = laps;
	}

	return index;
}
