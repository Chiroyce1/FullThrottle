import type { PageLoad } from "./$types";
import { findSessionMeta } from "$lib/metadata";
import type { YearEntry } from "$lib/metadata/types";

export const load: PageLoad = async ({ params, fetch }) => {
	const { year, round, session } = params;
	try {
		const res = await fetch("/metadata.json");
		if (res.ok) {
			const data = (await res.json()) as { years: YearEntry[] };
			const sessionMeta = findSessionMeta(data.years, year, round, session);
			return { sessionMeta };
		}
	} catch (e) {
		console.error("Failed to fetch metadata.json for replay SEO:", e);
	}

	return {
		sessionMeta: null,
	};
};
