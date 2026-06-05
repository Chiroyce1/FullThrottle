import posthog from "posthog-js";
import { browser, dev } from "$app/environment";

export const load = async () => {
	if (browser && !dev) {
		posthog.init("phc_Hye4Gc0rJydnW83HOD8OWwFMIsz2BeEluLfUeQC4rk3", {
			api_host: "https://eu.i.posthog.com",
			defaults: "2026-01-30",
		});
	}

	return;
};
