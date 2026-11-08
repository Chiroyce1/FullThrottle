import type { TelemetryRow, TrackPoint } from "$lib/types";

interface DensestLapSource {
	driverId: string;
	lapNumber: number;
	points: number;
}

interface DriverBestLap {
	driverId: string;
	lapNumber: number;
	time: number;
}

export function isValidCoord(x: number | undefined, y: number | undefined): boolean {
	if (x === undefined || y === undefined) return false;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
	return !(x === 0 && y === 0);
}

/** How many candidate laps to try before giving up on a clean outline. */
const MAX_PATH_CANDIDATES = 120;

/**
 * Outline of the circuit from one real lap: the fastest believable lap,
 * preferring the given driver (e.g. the race winner). Laps are tried
 * fastest first across all drivers until one passes `isConsistentPath`,
 * so a stretch of corrupt position data can't become the map.
 */
export function extractTrackPath(
	grouped: Record<string, TelemetryRow[]>,
	lapPointCounts: Record<string, Record<number, number>>,
	preferredDriverId: string,
): TrackPoint[] {
	const byTime = (a: DriverBestLap, b: DriverBestLap) => a.time - b.time;
	const preferred = (grouped[preferredDriverId] ? lapTimes(grouped[preferredDriverId]) : [])
		.map((l) => ({ driverId: preferredDriverId, ...l }))
		.sort(byTime);
	const others = Object.keys(grouped)
		.filter((id) => id !== preferredDriverId)
		.flatMap((id) => lapTimes(grouped[id]).map((l) => ({ driverId: id, ...l })))
		.sort(byTime);

	for (const c of [...preferred, ...others].slice(0, MAX_PATH_CANDIDATES)) {
		const path = extractLapPath(grouped[c.driverId] ?? [], c.lapNumber);
		if (isConsistentPath(path)) return path;
	}

	const densest = findDensestLap(lapPointCounts);
	if (densest) {
		const path = extractLapPath(grouped[densest.driverId] ?? [], densest.lapNumber);
		if (path.length > 0 && isConsistentPath(path)) return path;
	}

	// Last resort (no usable lap numbers): every 10th point of one driver,
	// only if it is circuit-sized. No map beats a wrong one.
	const fallbackId =
		preferredDriverId && grouped[preferredDriverId]
			? preferredDriverId
			: (Object.keys(grouped)[0] ?? "");
	if (!fallbackId) return [];

	const trace = grouped[fallbackId];
	const path: TrackPoint[] = [];
	for (let i = 0; i < trace.length; i += 10) {
		if (isValidCoord(trace[i].x, trace[i].y)) {
			path.push({ x: trace[i].x as number, y: trace[i].y as number });
		}
	}
	return withinCircuitSpan(path) ? path : [];
}

function findDensestLap(
	counts: Record<string, Record<number, number>>,
): DensestLapSource | null {
	let best: DensestLapSource | null = null;

	for (const driverId of Object.keys(counts)) {
		const laps = counts[driverId];
		for (const lapKey of Object.keys(laps)) {
			const lapNumber = Number(lapKey);
			if (!Number.isFinite(lapNumber) || lapNumber <= 0) continue;
			const points = laps[lapNumber];
			if (!best || points > best.points) {
				best = { driverId, lapNumber, points };
			}
		}
	}

	return best;
}

/** Every complete lap's duration from the telemetry clock. */
function lapTimes(trace: TelemetryRow[]): { lapNumber: number; time: number }[] {
	const out: { lapNumber: number; time: number }[] = [];
	let currentLap = 0;
	let lapStart = Number.NaN;

	for (let i = 0; i < trace.length; i++) {
		const lap = trace[i].lap_number ?? 0;
		const time = trace[i].session_time ?? 0;
		if (lap <= 0 || time <= 0) continue;

		if (currentLap === 0) {
			currentLap = lap;
			lapStart = time;
			continue;
		}

		if (lap > currentLap) {
			const duration = time - lapStart;
			// Real Grand Prix racing laps are between 45s and 300s.
			// Shorter durations indicate pit exits, incomplete/aborted laps, or timing dropouts.
			if (duration >= 45 && duration < 300) out.push({ lapNumber: currentLap, time: duration });
			currentLap = lap;
			lapStart = time;
		}
	}
	return out;
}

function extractLapPath(trace: TelemetryRow[], lapNumber: number): TrackPoint[] {
	const path: TrackPoint[] = [];
	for (let i = 0; i < trace.length; i++) {
		const row = trace[i];
		if (row.lap_number !== lapNumber) continue;
		if (!isValidCoord(row.x, row.y)) continue;
		path.push({ x: row.x as number, y: row.y as number });
	}
	return removeOutliers(path);
}

/**
 * Limits for a believable lap outline, in FastF1 decimetres. Measured on
 * the fastest qualifying laps at every circuit: the largest is Jeddah at
 * 2.74 km across, and the biggest gap between consecutive samples 135 m.
 * Corrupt position data (2026 Monaco race laps 2-40 put cars hundreds of
 * km away) fails these even when it is self-consistent.
 */
const MAX_CIRCUIT_SPAN = 40_000;
const MAX_SAMPLE_STEP = 3_000;

function withinCircuitSpan(path: TrackPoint[]): boolean {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const p of path) {
		minX = Math.min(minX, p.x);
		maxX = Math.max(maxX, p.x);
		minY = Math.min(minY, p.y);
		maxY = Math.max(maxY, p.y);
	}
	return Math.max(maxX - minX, maxY - minY) <= MAX_CIRCUIT_SPAN;
}

export function isConsistentPath(path: TrackPoint[]): boolean {
	if (path.length < 80) return false;

	if (!withinCircuitSpan(path)) return false;

	const stepDistances: number[] = [];
	let totalDist = 0;
	for (let i = 1; i < path.length; i++) {
		const dist = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
		if (Number.isFinite(dist) && dist > 0) {
			stepDistances.push(dist);
			totalDist += dist;
		}
	}

	if (stepDistances.length < Math.max(20, Math.floor(path.length * 0.5))) return false;

	// In FastF1 coordinates (decimeters), modern Grand Prix circuits are 3.3km - 7.0km (33,000 - 70,000 units).
	// Require at least 18,000 units (~1.8km) to reject partial lap snippets.
	if (totalDist < 18000) return false;

	// Circuit closure check: A complete lap must finish near where it started.
	const closureDist = Math.hypot(
		path[path.length - 1].x - path[0].x,
		path[path.length - 1].y - path[0].y,
	);
	if (closureDist > Math.max(2000, totalDist * 0.10)) return false;

	const sorted = [...stepDistances].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
	if (median <= 0) return false;

	const jumpThreshold = median * 10;
	let jumpCount = 0;
	let maxJump = 0;
	for (const d of stepDistances) {
		if (d > jumpThreshold) jumpCount++;
		if (d > maxJump) maxJump = d;
	}

	return (
		jumpCount / stepDistances.length <= 0.08 &&
		maxJump / median <= 24 &&
		maxJump <= MAX_SAMPLE_STEP
	);
}

function removeOutliers(path: TrackPoint[]): TrackPoint[] {
	// Return the raw path without filtering out coordinate facts.
	// If anomalous points must be identified for the UI, flag them rather than deleting them.
	return path;
}
