import type { TelemetryRow } from "$lib/types";
import type { TrackCorner } from "$lib/track-corners";
import * as d3 from "d3";

export interface CornerSpeed {
	corner: number;
	letter: string;
	label: string; // e.g. "1", "2A", "14"
	distance: number;
	minSpeed: number | null;
	minSpeedDist: number | null;
	entrySpeed: number | null;
	exitSpeed: number | null;
}

export interface ComputeCornerSpeedsOptions {
	/**
	 * Half-width in meters of the search window around each corner marker.
	 * Deliberately generous: lap slices start at slightly different physical
	 * points per driver, so markers can sit 50-100m off the true apex.
	 * Default: 175 meters.
	 */
	searchRadius?: number;
	/**
	 * Half-width in meters of the smoothing window. Distance-based (not
	 * sample-count-based) so sparse downsampled laps and dense raw laps
	 * behave identically. Default: 15 meters.
	 */
	smoothRadiusM?: number;
	/**
	 * Minimum deceleration into a trough (km/h) for it to count as a
	 * genuine apex rather than noise or a flat-out kink. Default: 6.
	 */
	minDropKmh?: number;
	/**
	 * Minimum deceleration as a fraction of pre-corner speed. Catches fast
	 * sweepers where the absolute dip is small but real. Default: 0.025.
	 */
	minDropPct?: number;
	/**
	 * Minimum re-acceleration out of a trough (km/h). Default: 4.
	 */
	minRiseKmh?: number;
	/**
	 * Distance in meters before/after the snapped apex used for
	 * entry/exit speeds. Default: 60.
	 */
	entryExitOffset?: number;
}

const bisectLeft = d3.bisector((d: TelemetryRow) => d.distance ?? 0).left;

function nullSpeed(
	corner: number,
	letter: string,
	label: string,
	distance: number,
): CornerSpeed {
	return {
		corner,
		letter,
		label,
		distance,
		minSpeed: null,
		minSpeedDist: null,
		entrySpeed: null,
		exitSpeed: null,
	};
}

/** Moving average over a ±radius meter window. Gaps propagate as NaN. */
function smoothSpeeds(lapData: TelemetryRow[], radiusM: number): number[] {
	const dists = lapData.map((r) => r.distance ?? NaN);
	const out = new Array<number>(lapData.length);
	for (let i = 0; i < lapData.length; i++) {
		const center = dists[i];
		if (!Number.isFinite(center)) {
			out[i] = NaN;
			continue;
		}
		let sum = 0;
		let n = 0;
		for (let j = 0; j < lapData.length; j++) {
			const d = dists[j];
			if (!Number.isFinite(d) || Math.abs(d - center) > radiusM) continue;
			const v = lapData[j]?.speed;
			if (typeof v === "number" && Number.isFinite(v)) {
				sum += v;
				n++;
			}
		}
		out[i] = n > 0 ? sum / n : NaN;
	}
	return out;
}

/**
 * Computes apex (minimum), entry, and exit speeds for each track corner
 * from normalized lap telemetry.
 *
 * Method: smooth the speed trace, find every genuine deceleration trough
 * inside a wide window around each corner marker, and snap to the trough
 * nearest the marker. Corners with no genuine trough (flat-out kinks,
 * straights, truncated laps) report null instead of a fake number.
 */
export function computeCornerSpeeds(
	corners: TrackCorner[],
	lapData: TelemetryRow[],
	options: ComputeCornerSpeedsOptions = {},
): CornerSpeed[] {
	if (!corners || corners.length === 0) return [];

	// Sort corners by distance to ensure adjacent distance checks work correctly
	const sortedCorners = [...corners].sort((a, b) => a.distance - b.distance);

	const radius = options.searchRadius ?? 175;
	const dropKmh = options.minDropKmh ?? 6;
	const dropPct = options.minDropPct ?? 0.025;
	const riseKmh = options.minRiseKmh ?? 4;
	const eeOffset = options.entryExitOffset ?? 60;

	const empty = (c: (typeof sortedCorners)[number]): CornerSpeed =>
		nullSpeed(
			c.number,
			c.letter || "",
			c.letter ? `${c.number}${c.letter}` : `${c.number}`,
			c.distance,
		);

	if (!lapData || lapData.length === 0) {
		return sortedCorners.map(empty);
	}

	const maxLapDist = lapData[lapData.length - 1]?.distance ?? 0;
	const smoothed = smoothSpeeds(lapData, options.smoothRadiusM ?? 15);

	/** Nearest sample index to a distance, or -1 when the lap is empty. */
	const nearestIdx = (dist: number): number => {
		const i = Math.min(
			lapData.length - 1,
			Math.max(0, bisectLeft(lapData, dist)),
		);
		if (lapData.length === 1) return 0;
		const d0 = lapData[i - 1];
		const d1 = lapData[i];
		if (d0 && d1) {
			return Math.abs((d0.distance ?? 0) - dist) <
				Math.abs((d1.distance ?? 0) - dist)
				? i - 1
				: i;
		}
		return i;
	};

	return sortedCorners.map((c) => {
		const label = c.letter ? `${c.number}${c.letter}` : `${c.number}`;

		// If the lap telemetry doesn't reach this corner (e.g. truncated or aborted lap)
		if (c.distance > maxLapDist + 200 || c.distance < (lapData[0]?.distance ?? 0) - 200) {
			return nullSpeed(c.number, c.letter || "", label, c.distance);
		}

		const windowStart = Math.max(0, c.distance - radius);
		const windowEnd = c.distance + radius;
		const startIdx = Math.max(0, bisectLeft(lapData, windowStart));
		const endIdx = Math.min(lapData.length, bisectLeft(lapData, windowEnd) + 1);

		// Collect every local minimum of the smoothed trace in the window.
		const troughs: number[] = [];
		for (let i = Math.max(1, startIdx); i < Math.min(smoothed.length - 1, endIdx); i++) {
			const v = smoothed[i];
			if (!Number.isFinite(v)) continue;
			const prev = smoothed[i - 1];
			const next = smoothed[i + 1];
			if (
				Number.isFinite(prev) &&
				Number.isFinite(next) &&
				v <= prev &&
				v <= next &&
				(v < prev || v < next)
			) {
				troughs.push(i);
			}
		}

		// Keep only genuine deceleration troughs: the car must have slowed
		// down into it and accelerated back out. Everything else is noise,
		// a flat-out kink, or a straight — all of which must score null.
		const context = 150;
		const genuine: number[] = [];
		for (const i of troughs) {
			const v = smoothed[i];
			const at = lapData[i]?.distance ?? c.distance;
			let preMax = -Infinity;
			for (let j = i - 1; j >= 0; j--) {
				const d = lapData[j]?.distance ?? 0;
				if (at - d > context) break;
				const s = smoothed[j];
				if (Number.isFinite(s) && s > preMax) preMax = s;
			}
			let postMax = -Infinity;
			for (let j = i + 1; j < smoothed.length; j++) {
				const d = lapData[j]?.distance ?? 0;
				if (d - at > context) break;
				const s = smoothed[j];
				if (Number.isFinite(s) && s > postMax) postMax = s;
			}
			const drop = preMax - v;
			const rise = postMax - v;
			if (
				preMax > -Infinity &&
				postMax > -Infinity &&
				drop >= Math.max(dropKmh, dropPct * preMax) &&
				rise >= riseKmh
			) {
				genuine.push(i);
			}
		}

		if (genuine.length === 0) {
			return nullSpeed(c.number, c.letter || "", label, c.distance);
		}

		// Snap to the genuine trough nearest the marker. This absorbs lap
		// slice misalignment: each driver is measured at their own real
		// apex, not at whatever the marker distance happens to hit.
		let best = genuine[0];
		let bestDist = Math.abs((lapData[best]?.distance ?? 0) - c.distance);
		for (const i of genuine) {
			const dd = Math.abs((lapData[i]?.distance ?? 0) - c.distance);
			if (dd < bestDist) {
				bestDist = dd;
				best = i;
			}
		}

		const apexDist = lapData[best]?.distance ?? c.distance;
		const rawMin = lapData[best]?.speed;
		const entryIdx = nearestIdx(apexDist - eeOffset);
		const exitIdx = nearestIdx(apexDist + eeOffset);
		const rawEntry = entryIdx >= 0 ? lapData[entryIdx]?.speed : null;
		const rawExit = exitIdx >= 0 ? lapData[exitIdx]?.speed : null;

		const clamp = (v: number | null | undefined): number | null =>
			typeof v === "number" && Number.isFinite(v)
				? Math.max(10, Math.min(380, v))
				: null;

		return {
			corner: c.number,
			letter: c.letter || "",
			label,
			distance: c.distance,
			minSpeed: clamp(rawMin),
			minSpeedDist: apexDist,
			entrySpeed: clamp(rawEntry),
			exitSpeed: clamp(rawExit),
		};
	});
}
