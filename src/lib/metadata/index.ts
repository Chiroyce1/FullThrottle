import type { YearEntry } from "./types";

export * from "./types";
export * from "./seo";

export interface ReplaySessionMeta {
	year: number;
	round: number;
	roundName: string;
	country?: string;
	location?: string;
	circuit?: string;
	date?: string;
	sessionCode: string;
	sessionLabel: string;
}

export function findSessionMeta(
	years: YearEntry[] | undefined,
	year: string | number,
	round: string | number,
	sessionCode: string,
): ReplaySessionMeta | null {
	const y = years?.find((item) => String(item.year) === String(year));
	const r = y?.rounds.find((item) => String(item.round) === String(round));
	const s = r?.sessions.find(
		(item) => item.code.toLowerCase() === String(sessionCode).toLowerCase(),
	);

	if (!y || !r || !s) return null;

	return {
		year: y.year,
		round: r.round,
		roundName: r.name,
		country: r.country,
		location: r.location,
		circuit: r.circuit,
		date: r.date,
		sessionCode: s.code,
		sessionLabel: s.label,
	};
}
