import type { TelemetryRow } from "$lib/types";

export interface LapAlignment {
	/** Meters added to the lap's distance to align it with the reference. */
	offsetM: number;
	/** Pearson correlation of speed traces at the chosen offset. */
	correlation: number;
	/** Overlap length in meters used for the correlation. */
	overlapM: number;
	/** False when the match is too weak to trust (different laps sliced wrong, pit laps, ...). */
	confident: boolean;
}

export interface AlignOptions {
	/** Max shift to try in either direction. Default: 300. */
	maxShiftM?: number;
	/** Grid step for resampling and search. Default: 5. */
	stepM?: number;
	/** Minimum correlation to call the alignment confident. Default: 0.7. */
	minCorrelation?: number;
	/** Minimum overlap in meters to attempt alignment. Default: 2000. */
	minOverlapM?: number;
}

function finiteSpeed(row: TelemetryRow): number | null {
	const s = row.speed;
	return typeof s === "number" && Number.isFinite(s) ? s : null;
}

/** Resample speed onto a regular distance grid via linear interpolation. */
function resample(
	rows: TelemetryRow[],
	step: number,
): { start: number; values: (number | null)[] } {
	if (rows.length === 0) return { start: 0, values: [] };
	const d0 = rows[0]?.distance ?? 0;
	const d1 = rows[rows.length - 1]?.distance ?? 0;
	const n = Math.max(1, Math.floor((d1 - d0) / step));
	const values: (number | null)[] = new Array(n + 1).fill(null);
	let j = 0;
	for (let i = 0; i <= n; i++) {
		const target = d0 + i * step;
		while (j < rows.length - 2 && (rows[j + 1]?.distance ?? 0) < target) j++;
		const a = rows[j];
		const b = rows[j + 1];
		if (!a || !b) continue;
		const da = a.distance ?? 0;
		const db = b.distance ?? 0;
		const sa = finiteSpeed(a);
		const sb = finiteSpeed(b);
		if (sa === null || sb === null || db <= da) continue;
		if (target < da || target > db) continue;
		const f = (target - da) / (db - da);
		values[i] = sa + f * (sb - sa);
	}
	return { start: d0, values };
}

function pearson(a: number[], b: number[]): number {
	const n = a.length;
	if (n === 0) return 0;
	const ma = a.reduce((s, v) => s + v, 0) / n;
	const mb = b.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < n; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/**
 * Align a lap to a reference lap by shifting it so the speed traces
 * correlate maximally. Returns a shifted COPY (never mutates the input,
 * which may be engine cache) plus alignment quality info.
 *
 * Why this exists: lap slices start at slightly different physical points
 * per driver (sampling phase, telemetry dropouts at the line, misassigned
 * lap boundaries in race data — up to hundreds of meters). Overlaying raw
 * slices compares different pieces of tarmac.
 */
export function alignLapToReference(
	reference: TelemetryRow[],
	lap: TelemetryRow[],
	options: AlignOptions = {},
): { rows: TelemetryRow[]; alignment: LapAlignment } {
	const noShift: LapAlignment = {
		offsetM: 0,
		correlation: 1,
		overlapM: 0,
		confident: true,
	};
	if (reference.length < 2 || lap.length < 2) {
		return {
			rows: lap,
			alignment: { ...noShift, confident: false },
		};
	}

	const step = options.stepM ?? 5;
	const maxShift = options.maxShiftM ?? 300;
	const minOverlap = options.minOverlapM ?? 2000;
	const minCorr = options.minCorrelation ?? 0.7;

	const ref = resample(reference, step);
	const tgt = resample(lap, step);

	let best = { offset: 0, corr: -2, overlap: 0 };
	for (let shift = -maxShift; shift <= maxShift; shift += step) {
		const a: number[] = [];
		const b: number[] = [];
		// Walk the target grid; map each point into the reference frame.
		for (let i = 0; i < tgt.values.length; i++) {
			const tv = tgt.values[i];
			if (tv === null) continue;
			const refDist = tgt.start + i * step + shift;
			const ri = Math.round((refDist - ref.start) / step);
			if (ri < 0 || ri >= ref.values.length) continue;
			const rv = ref.values[ri];
			if (rv === null) continue;
			a.push(tv);
			b.push(rv);
		}
		if (a.length * step < minOverlap) continue;
		const c = pearson(a, b);
		if (c > best.corr) best = { offset: shift, corr: c, overlap: a.length * step };
	}

	if (best.corr <= -2) {
		return { rows: lap, alignment: { ...noShift, confident: false } };
	}

	const shifted =
		best.offset === 0
			? lap
			: lap.map((r) => ({ ...r, distance: (r.distance ?? 0) + best.offset }));

	return {
		rows: shifted,
		alignment: {
			offsetM: best.offset,
			correlation: best.corr,
			overlapM: best.overlap,
			confident: best.corr >= minCorr,
		},
	};
}
