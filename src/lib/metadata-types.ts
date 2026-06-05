/**
 * Shared types for F1 session/round/year metadata.
 *
 * These are used across:
 *   - src/routes/+page.ts          (server load)
 *   - src/lib/components/SessionPicker.svelte
 *   - src/routes/telemetry/slot-manager.svelte.ts
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

import type { TelemetryMeta } from "$lib/types";

export interface SlotState {
	year: string;
	round: string;
	session: string;
	lastMetaKey: string;
	driver: string;
	lap: number | null;
	color: string;
	meta: TelemetryMeta | null;
	metaLoading: boolean;
	hasLoaded: boolean;
	lastLoadedKey: string;
	loadError: string;
	lastDriver: string;
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
