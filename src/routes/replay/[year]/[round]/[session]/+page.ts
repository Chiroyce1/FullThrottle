import type { PageLoad } from "./$types";
import { getSessionMeta } from "$lib/metadata-index";

export const load: PageLoad = async ({ params }) => {
	const { year, round, session } = params;
	const sessionMeta = getSessionMeta(year, round, session);

	return {
		sessionMeta,
	};
};
