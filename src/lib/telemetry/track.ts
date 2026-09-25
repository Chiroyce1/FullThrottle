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

export function extractTrackPath(
	grouped: Record<string, TelemetryRow[]>,
	lapPointCounts: Record<string, Record<number, number>>,
	preferredDriverId: string,
): TrackPoint[] {
	// If a preferred driver (e.g. race winner) is provided, test their best lap first
	if (preferredDriverId && grouped[preferredDriverId]) {
		const best = findBestLap(grouped[preferredDriverId]);
		if (best) {
			const path = extractLapPath(grouped[preferredDriverId], best.lapNumber);
			if (isConsistentPath(path)) return path;
		}
	}

	const fastest = rankByBestLap(grouped);
	for (let i = 0; i < fastest.length; i++) {
		const c = fastest[i];
		if (c.driverId === preferredDriverId) continue;
		const path = extractLapPath(grouped[c.driverId] ?? [], c.lapNumber);
		if (isConsistentPath(path)) return path;
	}

	const densest = findDensestLap(lapPointCounts);
	if (densest) {
		const path = extractLapPath(grouped[densest.driverId] ?? [], densest.lapNumber);
		if (path.length > 0 && isConsistentPath(path)) return path;
	}

	// Last resort: sample every 10th point from the preferred (or first) driver
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
	return path;
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

function rankByBestLap(grouped: Record<string, TelemetryRow[]>): DriverBestLap[] {
	const ranked: DriverBestLap[] = [];

	for (const driverId of Object.keys(grouped)) {
		const best = findBestLap(grouped[driverId]);
		if (best) ranked.push({ driverId, ...best });
	}

	ranked.sort((a, b) => a.time - b.time);
	return ranked;
}

function findBestLap(trace: TelemetryRow[]): { lapNumber: number; time: number } | null {
	if (trace.length < 2) return null;

	let currentLap = 0;
	let lapStart = Number.NaN;
	let bestLapNumber = 0;
	let bestLapTime = Infinity;

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
			if (duration >= 45 && duration < 300 && duration < bestLapTime) {
				bestLapTime = duration;
				bestLapNumber = currentLap;
			}
			currentLap = lap;
			lapStart = time;
		}
	}

	if (bestLapNumber <= 0 || !Number.isFinite(bestLapTime)) return null;
	return { lapNumber: bestLapNumber, time: bestLapTime };
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

export function isConsistentPath(path: TrackPoint[]): boolean {
	if (path.length < 80) return false;

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

	return jumpCount / stepDistances.length <= 0.08 && maxJump / median <= 24;
}

function removeOutliers(path: TrackPoint[]): TrackPoint[] {
	// Return the raw path without filtering out coordinate facts.
	// If anomalous points must be identified for the UI, flag them rather than deleting them.
	return path;
}
