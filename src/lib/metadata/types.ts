/**
 * Shared types for F1 session/round/year metadata.
 *
 * These are used across:
 *   - src/routes/+page.ts          (server load)
 *   - src/lib/components/SessionPicker.svelte
 *   - src/routes/telemetry/state/telemetry-state.svelte.ts
 *   - src/routes/telemetry/SlotRow.svelte
 */

export interface SessionEntry {
	/** Short session code, e.g. 'r', 'q', 'fp1', 's', 'sq' */
	code: string;
	/** Human-readable label, e.g. 'Race', 'Qualifying' */
	label: string;
}

export interface RoundEntry {
	round: number;
	/** e.g. 'Singapore Grand Prix' */
	name: string;
	sessions: SessionEntry[];
	country?: string;
	location?: string;
	circuit?: string;
	date?: string;
}

export interface YearEntry {
	year: number;
	rounds: RoundEntry[];
}

// ─── Slot state (telemetry page) ──────────────────────────────────────────────
//
// Year / round / session / meta are now GLOBAL (see TelemetryState) — every
// slot compares within the same track & session. A SlotState only carries
// what genuinely varies per comparison column: driver, lap, and color.
// `id` is kept because MetadataManager and EngineManager key their internal
// maps (abort controllers, sequence numbers) off it.

import type { TelemetryMeta } from "$lib/types";

export interface SlotState {
	id: string;
	year: string;
	round: string;
	session: string;
	driver: string;
	lap: number | null;
	color: string;
	meta: TelemetryMeta | null;
	metaLoading: boolean;
	lastDriver: string;
	hasLoaded: boolean;
	loadError: string;
	loadedKey: string;
}

export type MetaFetchTarget = SlotState;

// ─── Default picks ────────────────────────────────────────────────────────────

/** Fastest lap number for a driver from session metadata, or null. */
export function bestLapFromMeta(
	meta: TelemetryMeta | null,
	driverId: string,
): number | null {
	if (!meta || !driverId) return null;
	const laps = meta.drivers[driverId]?.valid_laps;
	if (!laps || laps.length === 0) return null;
	let best: number | null = null;
	let bestTime = Infinity;
	for (const l of laps) {
		const t = l.lap_time ?? 0;
		if (t > 0 && t < bestTime && l.lap_number != null) {
			bestTime = t;
			best = l.lap_number;
		}
	}
	return best;
}

/**
 * Top drivers by finishing position, falling back to grid, then best lap time.
 * Gives a sensible default pair (usually the front row or session leaders) instead of random picks.
 */
export function topDrivers(
	meta: TelemetryMeta | null,
	count: number,
): string[] {
	if (!meta?.drivers) return [];
	return Object.entries(meta.drivers)
		.map(([id, d]) => {
			let bestTime = Infinity;
			for (const l of d.valid_laps ?? []) {
				const t = l.lap_time ?? 0;
				if (t > 0 && t < bestTime) bestTime = t;
			}
			return {
				id,
				pos: d.pos > 0 ? d.pos : Infinity,
				grid: d.grid > 0 ? d.grid : Infinity,
				bestTime,
			};
		})
		.sort((a, b) => {
			if (a.pos !== b.pos) return a.pos - b.pos;
			if (a.grid !== b.grid) return a.grid - b.grid;
			return a.bestTime - b.bestTime;
		})
		.slice(0, count)
		.map((d) => d.id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the latest (highest) year from the metadata list, or null. */
export function latestYear(years: YearEntry[]): YearEntry | null {
	if (!years.length) return null;
	return [...years].sort((a, b) => b.year - a.year)[0];
}

/** Returns the latest (highest) round from a year entry, or null. */
export function latestRound(year: YearEntry | null): RoundEntry | null {
	if (!year) return null;
	return [...year.rounds].sort((a, b) => b.round - a.round)[0];
}

/** Returns the preferred default session from a round (race > last available), or null. */
export function latestSession(round: RoundEntry | null): SessionEntry | null {
	if (!round) return null;
	return (
		round.sessions.find((s) => s.code === "r") ||
		round.sessions[round.sessions.length - 1] ||
		null
	);
}
