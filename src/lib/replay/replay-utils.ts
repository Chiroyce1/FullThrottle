import type { DriverDot } from "$lib/components/TrackMap.svelte";
import type {
	DriverMeta,
	LeaderboardEntry,
	TelemetryFrameRow,
	TelemetryMeta,
} from "$lib/types";
import type { SessionMode } from "$lib/utils";

export const DEFAULT_POS_UNRANKED = 99;
export const TRACK_STATUS_SAFE = 1;
export const TRACK_STATUS_YELLOW = 2;
export const TRACK_STATUS_SC = 4;
export const TRACK_STATUS_RED = 5;
export const TRACK_STATUS_VSC_6 = 6;
export const TRACK_STATUS_VSC_7 = 7;

const COLOR_CLEAR = "#16a34a";
const COLOR_YELLOW = "#facc15";
const COLOR_SC = "#f97316";
const COLOR_RED = "#dc2626";

export interface NearbyDriverInfo {
	id: string;
	tla: string;
	color: string;
	position: number | null;
	gapToFocused: number | null;
	distanceToFocused: number | null;
}

export function normalizeReplaySessionCode(session: string): string {
	let sCode = session.toLowerCase();
	if (sCode === "race") sCode = "r";
	else if (sCode.startsWith("qual")) sCode = "q";
	else if (sCode === "sprint") sCode = "s";
	else if (sCode.startsWith("sprint") || sCode === "sq") sCode = "sq";
	else if (sCode === "practice-1" || sCode === "practice1" || sCode === "fp1")
		sCode = "fp1";
	else if (sCode === "practice-2" || sCode === "practice2" || sCode === "fp2")
		sCode = "fp2";
	else if (sCode === "practice-3" || sCode === "practice3" || sCode === "fp3")
		sCode = "fp3";
	return sCode;
}

export function getReplayFilename(
	year: string,
	round: string,
	session: string,
): string {
	if (round.startsWith("test")) return `f1_${year}_${round}_${session}`;
	const rNum = round.replace(/\D/g, "");
	const normalizedSession = normalizeReplaySessionCode(session);
	return `f1_${year}_rd${rNum}_${normalizedSession}`;
}

export function getDriverTla(
	meta: DriverMeta | null | undefined,
	fallbackId: string,
): string {
	if (meta?.abbreviation) return meta.abbreviation.toUpperCase();
	if (meta?.name) {
		const nameParts = meta.name.split(" ");
		const lastName = nameParts[nameParts.length - 1] || fallbackId;
		return lastName.slice(0, 3).toUpperCase();
	}
	return fallbackId;
}

export function buildActiveDots(
	currentFrameData: Record<string, TelemetryFrameRow>,
	metadata: TelemetryMeta | null,
): DriverDot[] {
	const dots: DriverDot[] = [];
	for (const [id, row] of Object.entries(currentFrameData)) {
		const meta: DriverMeta | undefined = metadata?.drivers?.[id];
		const tla = getDriverTla(meta, id);
		const x = row.x;
		const y = row.y;
		const z = row.z;
		const hasFiniteXY = Number.isFinite(x) && Number.isFinite(y);
		const allZero = (x ?? 0) === 0 && (y ?? 0) === 0 && (z ?? 0) === 0;
		if (hasFiniteXY && !allZero) {
			dots.push({
				id,
				label: tla,
				x: x as number,
				y: y as number,
				z,
				color: meta?.color || "#ffffff",
			});
		}
	}
	return dots;
}

export function sortLiveLeaderboard(
	entries: LeaderboardEntry[],
	sessionMode: SessionMode,
	isQualifying: boolean,
): LeaderboardEntry[] {
	if (isQualifying) {
		return entries.sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
			const posA: number = a.meta?.pos ?? DEFAULT_POS_UNRANKED;
			const posB: number = b.meta?.pos ?? DEFAULT_POS_UNRANKED;
			const effectiveA: number = posA <= 0 ? DEFAULT_POS_UNRANKED : posA;
			const effectiveB: number = posB <= 0 ? DEFAULT_POS_UNRANKED : posB;
			if (effectiveA !== effectiveB) return effectiveA - effectiveB;
			const bestA: number = a.row._cached_best_lap ?? Infinity;
			const bestB: number = b.row._cached_best_lap ?? Infinity;
			return bestA - bestB;
		});
	}

	if (sessionMode === "timed") {
		return entries.sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
			const bestA: number = a.row._cached_best_lap ?? Infinity;
			const bestB: number = b.row._cached_best_lap ?? Infinity;
			if (bestA !== bestB) return bestA - bestB;

			const lastA: number = a.row._cached_last_lap ?? Infinity;
			const lastB: number = b.row._cached_last_lap ?? Infinity;
			if (lastA !== lastB) return lastA - lastB;

			const posA: number = a.meta?.pos ?? DEFAULT_POS_UNRANKED;
			const posB: number = b.meta?.pos ?? DEFAULT_POS_UNRANKED;
			if (posA !== posB) return posA - posB;

			return Number(a.id) - Number(b.id);
		});
	}

	return entries.sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
		const posA: number = a.row.position ?? a.meta?.pos ?? DEFAULT_POS_UNRANKED;
		const posB: number = b.row.position ?? b.meta?.pos ?? DEFAULT_POS_UNRANKED;
		if (posA === 0 && posB !== 0) return 1;
		if (posB === 0 && posA !== 0) return -1;
		if (posA !== posB) return posA - posB;
		return 0;
	});
}

function toNearbyInfo(
	entry: LeaderboardEntry,
	gapToFocused: number | null,
	distanceToFocused: number | null,
): NearbyDriverInfo {
	return {
		id: entry.id,
		tla: getDriverTla(entry.meta, entry.id),
		color: entry.meta?.color || "#ffffff",
		position: entry.row.position ?? entry.meta?.pos ?? null,
		gapToFocused,
		distanceToFocused,
	};
}

export function getFocusedNearbyDrivers(
	leaderboard: LeaderboardEntry[],
	focusedDriver: string,
): {
	ahead: NearbyDriverInfo | null;
	behind: NearbyDriverInfo | null;
} {
	const index = leaderboard.findIndex((entry) => entry.id === focusedDriver);
	if (index === -1) {
		return { ahead: null, behind: null };
	}

	const focused = leaderboard[index];
	const focusedGap = Number.isFinite(focused.row.time_gap)
		? focused.row.time_gap
		: null;
	const focusedDist = Number.isFinite(focused.row.distance_to_driver_ahead)
		? focused.row.distance_to_driver_ahead
		: null;

	const ahead =
		index > 0
			? toNearbyInfo(
					leaderboard[index - 1],
					focusedGap ?? null,
					focusedDist ?? null,
				)
			: null;

	const behindEntry =
		index < leaderboard.length - 1 ? leaderboard[index + 1] : null;
	const behindGap =
		behindEntry && Number.isFinite(behindEntry.row.time_gap)
			? behindEntry.row.time_gap
			: null;
	const behindDist =
		behindEntry && Number.isFinite(behindEntry.row.distance_to_driver_ahead)
			? behindEntry.row.distance_to_driver_ahead
			: null;
	const behind =
		behindEntry != null
			? toNearbyInfo(behindEntry, behindGap ?? null, behindDist ?? null)
			: null;
	return { ahead, behind };
}

export function statusColor(code: number): string {
	switch (code) {
		case TRACK_STATUS_YELLOW:
			return COLOR_YELLOW;
		case TRACK_STATUS_SC:
			return COLOR_SC;
		case TRACK_STATUS_RED:
			return COLOR_RED;
		case TRACK_STATUS_VSC_6:
		case TRACK_STATUS_VSC_7:
			return COLOR_YELLOW;
		case TRACK_STATUS_SAFE:
		default:
			return COLOR_CLEAR;
	}
}

export function buildTrackStatusGradient(
	segments: Array<{ start: number; end: number; status: number }>,
	minSessionTime: number,
	maxSessionTime: number,
): string {
	if (!segments || segments.length === 0)
		return `background-color: ${COLOR_CLEAR}`;

	const totalDuration = maxSessionTime - minSessionTime;
	if (totalDuration <= 0) return `background-color: ${COLOR_CLEAR}`;

	const stops: string[] = [];
	for (const seg of segments) {
		const startPct = (
			((seg.start - minSessionTime) / totalDuration) *
			100
		).toFixed(2);
		const endPct = (((seg.end - minSessionTime) / totalDuration) * 100).toFixed(
			2,
		);
		const c = statusColor(seg.status);
		stops.push(`${c} ${startPct}%`, `${c} ${endPct}%`);
	}
	return `background: linear-gradient(to right, ${stops.join(", ")})`;
}
