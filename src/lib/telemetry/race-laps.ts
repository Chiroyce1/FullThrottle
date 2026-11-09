/**
 * Which lap a sample belongs to, from the session's own timing.
 *
 * OpenF1 sends telemetry for the whole session window, and the ingest
 * labels every sample before lap 1 starts as lap 1 (out-laps to the grid,
 * the grid, the formation lap) and every sample after the flag as the last
 * lap. Lap 1 then spans ~35 minutes and two laps of track. The data is kept
 * as ingested; this fixes only the labels the app reads, using each lap's
 * `lap_start_time` and the classified lap count, which share the samples'
 * clock. FastF1 sessions have no samples outside their laps and pass
 * through unchanged.
 */
import type { ClassificationEntry, TelemetryMeta, TelemetryRow, ValidLap } from "$lib/types";

/** Label for samples before a driver's lap 1 (grid, formation lap). */
export const BEFORE_START_LAP = 0;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Races and sprints are classified by laps; other sessions have no flag lap. */
function isRace(meta: TelemetryMeta | null | undefined): boolean {
	const code = meta?.session_info?.session_name?.toUpperCase();
	return code === "R" || code === "S";
}

/** A driver's classified laps in a race or sprint, or null. */
export function classifiedLaps(meta: TelemetryMeta | null | undefined, driverId: string): number | null {
	if (!isRace(meta)) return null;
	const entry = meta?.session_results?.find((r: ClassificationEntry) => r.driver === driverId);
	return finite(entry?.laps) && entry.laps > 0 ? entry.laps : null;
}

/** The race distance in laps (the winner's classified laps), or null. */
export function raceLaps(meta: TelemetryMeta | null | undefined): number | null {
	if (!isRace(meta)) return null;
	const laps = (meta?.session_results ?? []).map((r) => r.laps).filter(finite);
	return laps.length > 0 ? Math.max(...laps) : null;
}

/**
 * Relabels a driver's samples (sorted by session_time) in place: before lap
 * 1's start → BEFORE_START_LAP; after the classified last lap ends →
 * that lap + 1, the run back after the flag.
 */
export function relabelLaps(trace: TelemetryRow[], validLaps: ValidLap[], lastLap: number | null): void {
	const lap1Start = validLaps.find((l) => l.lap_number === 1)?.lap_start_time;
	const final = lastLap === null ? undefined : validLaps.find((l) => l.lap_number === lastLap);
	const finish =
		final && finite(final.lap_start_time) && finite(final.lap_time) ? final.lap_start_time + final.lap_time : null;

	for (const row of trace) {
		if (finite(lap1Start) && row.session_time < lap1Start) {
			row.lap_number = BEFORE_START_LAP;
		} else if (lastLap !== null && ((finish !== null && row.session_time >= finish) || row.lap_number > lastLap)) {
			row.lap_number = lastLap + 1;
		}
	}
}
