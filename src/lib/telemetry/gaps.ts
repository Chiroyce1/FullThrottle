import type { TelemetryFrameRow, TelemetryRow } from "$lib/types";

function findLatestSharedCrossing(
	c1: Float32Array | undefined,
	c2: Float32Array | undefined,
	targetTime: number,
): number | null {
	if (!c1 || !c2) return null;
	for (let j = c1.length - 1; j >= 0; j--) {
		const t1 = c1[j];
		if (t1 > 0 && t1 <= targetTime) {
			const t2 = c2[j];
			if (t2 > 0) {
				return t1 - t2;
			}
		}
	}
	return null;
}

export function applyDynamicNeighborGaps(
	frame: Record<string, TelemetryFrameRow>,
	estimatedLapLengthMeters: number,
	sectorCrossings: Record<string, Float32Array>,
): void {
	const entries = Object.values(frame);
	if (entries.length === 0) return;
	const lapLength = Math.max(1000, estimatedLapLengthMeters || 5000);

	const ranked = entries.filter((row) => {
		const pos = row.position ?? 0;
		return pos > 0 && Number.isFinite(row.distance);
	});

	ranked.sort((a, b) => {
		const posA = a.position ?? Number.MAX_SAFE_INTEGER;
		const posB = b.position ?? Number.MAX_SAFE_INTEGER;
		if (posA !== posB) return posA - posB;

		const distA = Number.isFinite(a.distance) ? a.distance : -Infinity;
		const distB = Number.isFinite(b.distance) ? b.distance : -Infinity;
		return distB - distA;
	});

	for (let i = 0; i < ranked.length; i++) {
		const row = ranked[i];
		if (i === 0) {
			row.distance_to_driver_ahead = 0;
			row.time_gap = 0;
			row.gap_to_leader = 0;
			continue;
		}

		const ahead = ranked[i - 1];
		const leader = ranked[0];
		const aheadId = ahead.driver_number?.toString();
		const currentId = row.driver_number?.toString();
		const leaderId = leader.driver_number?.toString();

		const exactGap = findLatestSharedCrossing(
			sectorCrossings[currentId],
			sectorCrossings[aheadId],
			row.session_time,
		);

		const exactLeaderGap = findLatestSharedCrossing(
			sectorCrossings[currentId],
			sectorCrossings[leaderId],
			row.session_time,
		);

		const aheadDistance = Number.isFinite(ahead.distance) ? ahead.distance : 0;
		const currentDistance = Number.isFinite(row.distance) ? row.distance : 0;
		const aheadLap = Math.max(0, ahead.lap_number ?? 0);
		const currentLap = Math.max(0, row.lap_number ?? 0);

		const aheadProgress = aheadLap * lapLength + aheadDistance;
		const currentProgress = currentLap * lapLength + currentDistance;

		let gapMeters = aheadProgress - currentProgress;
		// Remove artificial clamping to 0. Let the raw mathematical gap stand.
		if (gapMeters < -(lapLength * 0.4)) {
			gapMeters += lapLength;
		}
		row.distance_to_driver_ahead = gapMeters;

		row.time_gap = exactGap !== null && exactGap > 0 ? exactGap : undefined;
		row.gap_to_leader = exactLeaderGap !== null && exactLeaderGap > 0 ? exactLeaderGap : undefined;
	}

	for (let i = 0; i < entries.length; i++) {
		const row = entries[i];
		const pos = row.position ?? 0;
		if (pos > 0) continue;
		row.distance_to_driver_ahead = -1;
		row.time_gap = -1;
	}
}

export function estimateLapLengthMeters(grouped: Record<string, TelemetryRow[]>): number {
	const candidates: number[] = [];

	for (const id of Object.keys(grouped)) {
		const trace = grouped[id];
		if (!trace || trace.length === 0) continue;

		const lapMax: Record<number, number> = {};
		for (let i = 0; i < trace.length; i++) {
			const row = trace[i];
			const lap = row.lap_number ?? 0;
			const dist = row.distance;
			if (lap <= 0 || !Number.isFinite(dist) || dist <= 0) continue;
			lapMax[lap] = Math.max(lapMax[lap] ?? 0, dist);
		}

		for (const lapKey of Object.keys(lapMax)) {
			const maxDist = lapMax[Number(lapKey)];
			if (maxDist > 2500 && maxDist < 12000) {
				candidates.push(maxDist);
			}
		}
	}

	if (candidates.length === 0) return 5000;
	candidates.sort((a, b) => a - b);
	return candidates[Math.floor(candidates.length / 2)] ?? 5000;
}
