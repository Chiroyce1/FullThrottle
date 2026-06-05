import type { TelemetryRow } from "$lib/types";
import * as d3 from "d3";

export function rowAtDist(
	data: TelemetryRow[],
	x: number | null,
): TelemetryRow | null {
	if (x == null || data.length === 0) return data[0] ?? null;
	const bisect = d3.bisector((d: TelemetryRow) => d.distance ?? 0).left;
	const idx = bisect(data, x);
	const d0 = data[idx - 1];
	const d1 = data[idx];
	if (!d0) return d1 ?? null;
	if (!d1) return d0;
	return x - (d0.distance ?? 0) > (d1.distance ?? 0) - x ? d1 : d0;
}

export function buildSpeedDeltaSegmentsN(
	datasets: { data: TelemetryRow[]; color: string }[],
): { color: string; points: { x: number; y: number }[] }[] {
	const bisect = d3.bisector((d: TelemetryRow) => d.distance ?? 0).left;
	const segments: { color: string; points: { x: number; y: number }[] }[] = [];
	let current: { color: string; points: { x: number; y: number }[] } | null = null;

	const baseData = datasets[0].data;

	for (const rowBase of baseData) {
		if (rowBase.x === undefined || rowBase.y === undefined) continue;
		const dist = rowBase.distance ?? 0;

		let maxSpeed = -Infinity;
		let winnerColor = datasets[0].color;

		for (const ds of datasets) {
			const idx = bisect(ds.data, dist);
			const d0 = ds.data[idx - 1];
			const d1 = ds.data[idx];
			const row = !d0
				? d1
				: !d1
					? d0
					: dist - (d0.distance ?? 0) > (d1.distance ?? 0) - dist
						? d1
						: d0;
			if (!row) continue;
			const spd = row.speed ?? 0;
			if (spd > maxSpeed) {
				maxSpeed = spd;
				winnerColor = ds.color;
			}
		}

		if (!current || current.color !== winnerColor) {
			if (current && current.points.length >= 3) segments.push(current);
			current = {
				color: winnerColor,
				points: [{ x: rowBase.x, y: rowBase.y }],
			};
		} else {
			current.points.push({ x: rowBase.x, y: rowBase.y });
		}
	}
	if (current && current.points.length >= 3) segments.push(current);
	return segments;
}
