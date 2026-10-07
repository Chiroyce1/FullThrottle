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
	 * Maximum distance in meters before the corner apex to look for min speed.
	 * Default: 100 meters.
	 */
	approachDistance?: number;
	/**
	 * Maximum distance in meters after the corner apex to look for min speed.
	 * Default: 50 meters.
	 */
	exitDistance?: number;
}

const bisectLeft = d3.bisector((d: TelemetryRow) => d.distance ?? 0).left;
const bisectRight = d3.bisector((d: TelemetryRow) => d.distance ?? 0).right;

/**
 * Computes minimum (apex), entry, and exit speeds for each track corner
 * from normalized lap telemetry.
 */
export function computeCornerSpeeds(
	corners: TrackCorner[],
	lapData: TelemetryRow[],
	options: ComputeCornerSpeedsOptions = {},
): CornerSpeed[] {
	if (!corners || corners.length === 0) return [];

	const defaultApproach = options.approachDistance ?? 100;
	const defaultExit = options.exitDistance ?? 50;

	// Sort corners by distance to ensure adjacent distance checks work correctly
	const sortedCorners = [...corners].sort((a, b) => a.distance - b.distance);

	if (!lapData || lapData.length === 0) {
		return sortedCorners.map((c) => ({
			corner: c.number,
			letter: c.letter || "",
			label: c.letter ? `${c.number}${c.letter}` : `${c.number}`,
			distance: c.distance,
			minSpeed: null,
			minSpeedDist: null,
			entrySpeed: null,
			exitSpeed: null,
		}));
	}

	const maxLapDist = lapData[lapData.length - 1]?.distance ?? 0;

	return sortedCorners.map((c, i) => {
		const label = c.letter ? `${c.number}${c.letter}` : `${c.number}`;

		// If the lap telemetry doesn't reach this corner (e.g. truncated or aborted lap)
		if (c.distance > maxLapDist + 200 || c.distance < (lapData[0]?.distance ?? 0) - 200) {
			return {
				corner: c.number,
				letter: c.letter || "",
				label,
				distance: c.distance,
				minSpeed: null,
				minSpeedDist: null,
				entrySpeed: null,
				exitSpeed: null,
			};
		}

		// Prevent search window from overlapping with adjacent corners
		const prev = i > 0 ? sortedCorners[i - 1] : null;
		const next = i < sortedCorners.length - 1 ? sortedCorners[i + 1] : null;

		let actualApproach = defaultApproach;
		if (prev && prev.distance < c.distance) {
			const deltaPrev = c.distance - prev.distance;
			actualApproach = Math.max(15, Math.min(defaultApproach, deltaPrev * 0.6));
		}

		let actualExit = defaultExit;
		if (next && next.distance > c.distance) {
			const deltaNext = next.distance - c.distance;
			actualExit = Math.max(10, Math.min(defaultExit, deltaNext * 0.4));
		}

		const windowStart = Math.max(0, c.distance - actualApproach);
		const windowEnd = c.distance + actualExit;

		const startIdx = bisectLeft(lapData, windowStart);
		const endIdx = bisectRight(lapData, windowEnd);

		if (startIdx < endIdx) {
			let minSpeed = Infinity;
			let minSpeedDist: number | null = null;
			let minIdx = -1;
			let entrySpeed: number | null = null;
			let exitSpeed: number | null = null;

			// Sample directly at the corner marker distance (c.distance)
			const apexRowIdx = Math.min(
				lapData.length - 1,
				Math.max(0, bisectLeft(lapData, c.distance)),
			);
			const apexSpeed = lapData[apexRowIdx]?.speed ?? null;

			for (let j = startIdx; j < endIdx; j++) {
				const row = lapData[j];
				const spd = row.speed;
				if (spd != null && Number.isFinite(spd)) {
					if (entrySpeed === null) {
						entrySpeed = spd;
					}
					exitSpeed = spd;
					if (spd < minSpeed) {
						minSpeed = spd;
						minSpeedDist = row.distance ?? c.distance;
						minIdx = j;
					}
				}
			}

			// A corner has a genuine apex trough if the car slowed down into the corner (deceleration dip).
			// If speed was monotonically increasing (e.g. accelerating through flat-out kinks like Baku T17, T18,
			// or Eau Rouge), the minimum is simply the first sample in the window 100m earlier, which is NOT the corner speed.
			// In that case, the corner speed is the speed AT the corner marker itself.
			const isTrough =
				entrySpeed != null &&
				minSpeed < entrySpeed - 2.5 &&
				minIdx > startIdx;

			const effectiveMinSpeed = isTrough
				? (minSpeed !== Infinity ? minSpeed : apexSpeed)
				: (apexSpeed ?? (minSpeed !== Infinity ? minSpeed : null));

			const effectiveMinDist = isTrough
				? minSpeedDist
				: (lapData[apexRowIdx]?.distance ?? c.distance);

			const clampedMinSpeed =
				effectiveMinSpeed != null && Number.isFinite(effectiveMinSpeed)
					? Math.max(10, Math.min(380, effectiveMinSpeed))
					: null;
			const clampedEntrySpeed =
				entrySpeed != null && Number.isFinite(entrySpeed)
					? Math.max(10, Math.min(380, entrySpeed))
					: null;
			const clampedExitSpeed =
				exitSpeed != null && Number.isFinite(exitSpeed)
					? Math.max(10, Math.min(380, exitSpeed))
					: null;

			return {
				corner: c.number,
				letter: c.letter || "",
				label,
				distance: c.distance,
				minSpeed: clampedMinSpeed,
				minSpeedDist: effectiveMinDist,
				entrySpeed: clampedEntrySpeed,
				exitSpeed: clampedExitSpeed,
			};
		}

		// Fallback: If no sample points strictly fell inside [windowStart, windowEnd],
		// find nearest row to corner distance
		const nearIdx = bisectLeft(lapData, c.distance);
		const d0 = lapData[nearIdx - 1];
		const d1 = lapData[nearIdx];
		let nearestRow: TelemetryRow | null = null;

		if (d0 && d1) {
			nearestRow =
				Math.abs((d0.distance ?? 0) - c.distance) <
				Math.abs((d1.distance ?? 0) - c.distance)
					? d0
					: d1;
		} else {
			nearestRow = d0 ?? d1 ?? null;
		}

		if (
			nearestRow &&
			nearestRow.speed != null &&
			Number.isFinite(nearestRow.speed) &&
			Math.abs((nearestRow.distance ?? 0) - c.distance) <= Math.max(actualApproach, 100)
		) {
			const clampedSpd = Math.max(10, Math.min(380, nearestRow.speed));
			return {
				corner: c.number,
				letter: c.letter || "",
				label,
				distance: c.distance,
				minSpeed: clampedSpd,
				minSpeedDist: nearestRow.distance ?? c.distance,
				entrySpeed: clampedSpd,
				exitSpeed: clampedSpd,
			};
		}

		return {
			corner: c.number,
			letter: c.letter || "",
			label,
			distance: c.distance,
			minSpeed: null,
			minSpeedDist: null,
			entrySpeed: null,
			exitSpeed: null,
		};
	});
}
