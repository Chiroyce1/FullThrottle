/**
 * Pure derivations behind the telemetry view (no runes, no DOM) so they
 * can be unit tested. `TelemetryView` wires these to reactive state.
 */
import type {
	ChartHighlight,
	CornerApexDriver,
	CornerApexMarker,
} from "$lib/components/SyncedTelemetryChart.svelte";
import type { Corner, CornerAnalysis, CornerReading } from "$lib/telemetry/corners";
import type { TelemetryRow } from "$lib/types";
import {
	LICO_THROTTLE_THRESHOLD,
	LICO_MIN_DISTANCE,
	LICO_COLOR,
} from "$lib/constants";

/** Who a lap belongs to, in the same order as the analysed laps. */
export interface LapIdentity {
	tla: string;
	color: string;
}

/**
 * Lift & coast: coming off the throttle (below `throttleThreshold` %) and
 * coasting, off the brake, into a braking zone for at least
 * LICO_MIN_DISTANCE. Runs from the lift to the first brake sample.
 * Off-throttle stretches that start from the brake (mid-corner) or end
 * back on the throttle (a lift through a corner) aren't LiCO.
 */
export function computeLicoHighlights(
	datasets: TelemetryRow[][],
	throttleThreshold = LICO_THROTTLE_THRESHOLD,
): ChartHighlight[] {
	const out: ChartHighlight[] = [];
	const coasting = (r: TelemetryRow) => (r.throttle || 0) < throttleThreshold && !r.brake;
	for (const data of datasets) {
		let i = 1;
		while (i < data.length) {
			if (!coasting(data[i])) {
				i++;
				continue;
			}
			let j = i;
			while (j + 1 < data.length && coasting(data[j + 1])) j++;
			const prev = data[i - 1];
			const next = data[j + 1];
			const fromThrottle = !prev.brake && (prev.throttle || 0) >= throttleThreshold;
			if (fromThrottle && next?.brake) {
				const start = data[i].distance ?? 0;
				const end = next.distance ?? 0;
				if (end - start >= LICO_MIN_DISTANCE) {
					out.push({ start, end, color: LICO_COLOR, label: "LiCO" });
				}
			}
			i = j + 1;
		}
	}
	return out;
}

export interface HoverSample {
	tla: string;
	row: TelemetryRow;
}

/**
 * Single track-map cursor at the hover distance: placed on the fastest
 * driver, labelled with the speed gap to the slowest.
 */
export function hoverCursorDots(samples: (HoverSample | null)[]) {
	const valid = samples
		.filter((s): s is HoverSample => {
			if (!s) return false;
			const { row } = s;
			if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return false;
			return !(row.x === 0 && row.y === 0);
		})
		.map((s) => ({ ...s, speed: s.row.speed ?? 0 }));

	if (valid.length === 0) return [];

	const winner = valid.reduce(
		(fastest, s) => (s.speed > fastest.speed ? s : fastest),
		valid[0],
	);
	const speeds = valid.map((s) => s.speed);
	const speedGap = Math.round(Math.max(...speeds) - Math.min(...speeds));

	const label =
		valid.length === 1 || speedGap === 0
			? winner.tla
			: `${winner.tla} +${speedGap}km/h`;

	return [
		{
			id: "hover-cursor",
			label,
			x: winner.row.x,
			y: winner.row.y,
			z: winner.row.z,
			color: "#ffffff",
		},
	];
}

/**
 * Minimum-speed dots per corner, for laps with a reading there. Corners
 * every lap took flat out get no dots: their "minimum" is just a point
 * on a straight.
 */
export function computeApexMarkers(
	analysis: CornerAnalysis,
	laps: LapIdentity[],
): CornerApexMarker[] {
	return analysis.corners
		.map((c, k) => {
			const readings = laps
				.map((lap, li) => ({ lap, r: analysis.readings[li]?.[k] ?? null }))
				.filter((x): x is { lap: LapIdentity; r: CornerReading } => x.r !== null);
			if (readings.length === 0 || readings.every((x) => x.r.flat)) return null;
			const top = Math.max(...readings.map((x) => Math.round(x.r.minSpeed)));
			const drivers: CornerApexDriver[] = readings.map(({ lap, r }) => ({
				tla: lap.tla,
				color: lap.color,
				speed: r.minSpeed,
				distance: r.apexDist,
				isFastest: Math.round(r.minSpeed) === top,
			}));
			return { key: c.key, drivers };
		})
		.filter((m): m is CornerApexMarker => m !== null);
}

/** How close (m) the hover distance must be to a corner to activate it. */
export const CORNER_PROXIMITY = 120;

/** Key of the corner nearest the hover distance, if within CORNER_PROXIMITY. */
export function activeCornerAt(corners: Corner[], hoverDist: number | null): string | null {
	if (hoverDist === null) return null;
	let best: Corner | null = null;
	for (const c of corners) {
		if (!best || Math.abs(c.distance - hoverDist) < Math.abs(best.distance - hoverDist)) {
			best = c;
		}
	}
	return best && Math.abs(best.distance - hoverDist) <= CORNER_PROXIMITY ? best.key : null;
}

export interface CornerRow {
	corner: Corner;
	/** Rounded minimum speed per lap (null = no data). */
	speeds: (number | null)[];
	/** Every lap with data took it flat out. */
	flat: boolean;
	/** Index of the fastest lap, null on a tie or with fewer than two readings. */
	leader: number | null;
	/** km/h ahead of the next lap, null without a leader. */
	margin: number | null;
}

/** One row per corner in track order, comparing every lap's minimum speed. */
export function cornerRows(analysis: CornerAnalysis, lapCount: number): CornerRow[] {
	return analysis.corners.map((corner, k) => {
		const readings = Array.from({ length: lapCount }, (_, li) => analysis.readings[li]?.[k] ?? null);
		const speeds = readings.map((r) => (r ? Math.round(r.minSpeed) : null));
		const ranked = speeds
			.map((v, i) => ({ v, i }))
			.filter((x): x is { v: number; i: number } => x.v !== null)
			.sort((a, b) => b.v - a.v);
		const decided = ranked.length >= 2 && ranked[0].v !== ranked[1].v;
		return {
			corner,
			speeds,
			flat: readings.some((r) => r) && readings.every((r) => !r || r.flat),
			leader: decided ? ranked[0].i : null,
			margin: decided ? ranked[0].v - ranked[1].v : null,
		};
	});
}

/** Corners won per lap, plus ties, over corners where at least two laps have data. */
export function cornerTally(rows: CornerRow[], lapCount: number) {
	const wins = new Array<number>(lapCount).fill(0);
	let ties = 0;
	for (const row of rows) {
		if (row.speeds.filter((v) => v !== null).length < 2) continue;
		if (row.leader === null) ties++;
		else wins[row.leader]++;
	}
	return { wins, ties };
}

/** The active corner's row, with each lap's delta to the fastest. */
export function activeCornerSummary(
	rows: CornerRow[],
	activeKey: string | null,
	laps: LapIdentity[],
) {
	const row = rows.find((r) => r.corner.key === activeKey);
	if (!row) return null;
	const present = row.speeds.filter((v): v is number => v !== null);
	if (present.length === 0) return null;
	const top = Math.max(...present);
	return {
		corner: row.corner,
		speeds: laps
			.map((lap, i) => ({ ...lap, minSpeed: row.speeds[i] }))
			.filter((s): s is LapIdentity & { minSpeed: number } => s.minSpeed !== null)
			.map((s) => ({
				...s,
				isFastest: s.minSpeed === top,
				deltaVsFastest: s.minSpeed - top,
			})),
	};
}

export type ActiveCornerSummary = NonNullable<ReturnType<typeof activeCornerSummary>>;
