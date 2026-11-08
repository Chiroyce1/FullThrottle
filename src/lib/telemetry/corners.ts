/**
 * Corner analysis: where each corner sits on the chart, and the lowest
 * speed each lap recorded through it.
 *
 * A corner runs from where the track starts turning to where it stops
 * (`entry` / `exit` in static/tracks/*.json, measured from real telemetry
 * by ingest/corner_spans.py). On each lap, entry and exit are projected
 * onto the lap's path, and the corner's minimum is the lowest speed
 * recorded between them. Laps are compared on their own minimums, wherever
 * on the corner each one happened.
 *
 * That lowest sample only counts if speed bottoms out there. If it sits on
 * the span's edge with speed still rising into it (accelerating out of the
 * previous corner) or still falling out of it (braking for the next), the
 * lap didn't slow for this corner: it reads the speed at the corner's own
 * point instead, so every lap is compared at the same place.
 *
 * Every threshold below was measured on real 2026 sessions; the tests run
 * against real laps (tests/fixtures/corners) with expected values computed
 * independently in numpy.
 */
import type { TelemetryRow } from "$lib/types";
import type { TrackCorner } from "$lib/track-corners";

/** A track corner placed on the chart's distance axis. */
export interface Corner extends TrackCorner {
	/** Unique id and display label: "1", "9A", "9B". */
	key: string;
	/** Chart-frame distance (the corner on the reference lap). */
	distance: number;
}

export interface CornerReading {
	/** Lowest speed recorded between entry and exit, km/h. */
	minSpeed: number;
	/** Chart-frame distance where it was recorded. */
	apexDist: number;
	/**
	 * Taken without a real slowdown (kink, flat-out sweeper, or no minimum of
	 * its own); `minSpeed` is then the speed at the corner's point.
	 */
	flat: boolean;
}

export interface CornerAnalysis {
	corners: Corner[];
	/** readings[lap][corner], null where the lap has no trustworthy reading. */
	readings: (CornerReading | null)[][];
}

/**
 * Max distance (m) between a corner's entry/exit and the lap's path. On
 * normal laps 99.9% sit within 3.4 m; the pit lane runs ~20 m off.
 */
export const LOCATE_TOLERANCE_M = 10;
/** Sampling gaps longer than this (m) can hide an apex. Median gap is ~14 m. */
export const MAX_GAP_M = 40;
/**
 * Speed, RPM and gear frozen for longer than this (m) is a forward-filled
 * dropout. Speed alone isn't enough: cars hold top speed for 100 m+ while
 * RPM keeps moving.
 */
export const FROZEN_RUN_M = 80;
/** Slowdown (km/h) below which a corner counts as taken flat. */
const FLAT_DROP_KMH = 8;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const cornerKey = (c: Pick<TrackCorner, "number" | "letter">): string =>
	`${c.number}${c.letter || ""}`;

/** Samples with a speed, a distance and a real position, in distance order. */
function usable(lap: TelemetryRow[]): TelemetryRow[] {
	return lap
		.filter(
			(r) =>
				finite(r.distance) &&
				finite(r.speed) &&
				finite(r.x) &&
				finite(r.y) &&
				!(r.x === 0 && r.y === 0),
		)
		.sort((a, b) => a.distance - b.distance);
}

/** Samples inside forward-filled dropouts. Laps without RPM can't be checked. */
function frozenMask(lap: TelemetryRow[]): boolean[] {
	const mask = new Array<boolean>(lap.length).fill(false);
	let start = 0;
	for (let i = 1; i <= lap.length; i++) {
		const a = lap[start];
		const b = lap[i];
		if (b && finite(a.rpm) && b.speed === a.speed && b.rpm === a.rpm && b.n_gear === a.n_gear) {
			continue;
		}
		if (i - start > 2 && lap[i - 1].distance - a.distance >= FROZEN_RUN_M) {
			mask.fill(true, start, i);
		}
		start = i;
	}
	return mask;
}

/**
 * The point on the lap's path (the polyline through its samples) closest to
 * (px, py), searching segments within `radius` m of lap distance `around`.
 * Returns that point's lap distance and how far off the path the target is.
 * Positions are in decimetres (FastF1), distances in meters.
 */
function project(
	lap: TelemetryRow[],
	px: number,
	py: number,
	around: number,
	radius: number,
): { dist: number; off: number } | null {
	let best: { dist: number; off: number } | null = null;
	for (let i = 0; i < lap.length - 1; i++) {
		const a = lap[i];
		if (Math.abs(a.distance - around) > radius) continue;
		const b = lap[i + 1];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / len2));
		const off = Math.hypot(a.x + t * dx - px, a.y + t * dy - py) / 10;
		if (!best || off < best.off) {
			best = { dist: a.distance + t * (b.distance - a.distance), off };
		}
	}
	return best;
}

/** Speed at lap distance `d`, linear between samples. */
function speedAt(lap: TelemetryRow[], d: number): number {
	let i = 1;
	while (i < lap.length - 1 && lap[i].distance < d) i++;
	const a = lap[i - 1];
	const b = lap[i];
	const span = b.distance - a.distance;
	if (span <= 0) return a.speed;
	const t = Math.min(1, Math.max(0, (d - a.distance) / span));
	return a.speed + t * (b.speed - a.speed);
}

function measure(c: TrackCorner, lap: TelemetryRow[], frozen: boolean[]): CornerReading | null {
	if (!c.entry || !c.exit || lap.length < 2) return null;
	const mid = project(lap, c.x, c.y, c.distance, 500);
	if (!mid) return null;
	const entry = project(lap, c.entry.x, c.entry.y, mid.dist, 300);
	const exit = project(lap, c.exit.x, c.exit.y, mid.dist, 300);
	if (!entry || !exit || exit.dist < entry.dist) return null;
	// Didn't drive through it: pit lane, off track, truncated lap.
	if (Math.max(entry.off, exit.off) > LOCATE_TOLERANCE_M) return null;

	let first = lap.findIndex((r) => r.distance >= entry.dist);
	if (first < 0) first = lap.length;
	let last = first - 1;
	while (last + 1 < lap.length && lap[last + 1].distance <= exit.dist) last++;

	// Include the samples either side, so gaps across entry/exit count too.
	const lo = Math.max(0, first - 1);
	const hi = Math.min(lap.length - 1, last + 1);
	for (let i = lo; i <= hi; i++) if (frozen[i]) return null;

	// A gap can hide the apex only if speed falls into it and rises out of it.
	if (last < first) return null;
	for (let i = lo; i < hi; i++) {
		if (lap[i + 1].distance - lap[i].distance <= MAX_GAP_M) continue;
		const fallingIn = i === 0 || lap[i - 1].speed > lap[i].speed;
		const risingOut = i + 2 >= lap.length || lap[i + 2].speed > lap[i + 1].speed;
		if (fallingIn && risingOut) return null;
	}

	let apex = first;
	for (let i = first + 1; i <= last; i++) if (lap[i].speed < lap[apex].speed) apex = i;

	const risingIn = apex === first && first > 0 && lap[first - 1].speed < lap[apex].speed;
	const fallingOut = apex === last && last + 1 < lap.length && lap[last + 1].speed < lap[apex].speed;
	if (risingIn || fallingOut) {
		return { minSpeed: Math.round(speedAt(lap, mid.dist)), apexDist: mid.dist, flat: true };
	}

	let before = lap[apex].speed;
	for (let i = apex; i >= 0 && lap[apex].distance - lap[i].distance <= 150; i--) {
		before = Math.max(before, lap[i].speed);
	}

	return {
		minSpeed: lap[apex].speed,
		apexDist: lap[apex].distance,
		flat: before - lap[apex].speed < FLAT_DROP_KMH,
	};
}

/**
 * Places the track's corners on the chart and measures every lap through
 * them. `laps` must share one distance frame (the chart's); the first lap
 * with data is the reference for corner positions.
 */
export function analyzeCorners(trackCorners: TrackCorner[], laps: TelemetryRow[][]): CornerAnalysis {
	const sorted = [...trackCorners].sort((a, b) => a.distance - b.distance);
	const cleaned = laps.map(usable);
	const ref = cleaned.find((l) => l.length >= 2) ?? [];

	const corners: Corner[] = sorted.map((c) => ({
		...c,
		key: cornerKey(c),
		distance: project(ref, c.x, c.y, c.distance, 500)?.dist ?? c.distance,
	}));

	const readings = cleaned.map((lap) => {
		const frozen = frozenMask(lap);
		return sorted.map((c) => measure(c, lap, frozen));
	});

	return { corners, readings };
}
