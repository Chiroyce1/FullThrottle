import type { ReplaySessionMeta } from "./index";

export const SITE_CONFIG = {
	url: "https://fullthrottle.chiroyce.dev",
	name: "FullThrottle",
	tagline: "F1 Telemetry, Lap Analysis & Session Replays",
	defaultTitle: "FullThrottle — F1 Telemetry, Lap Analysis & Session Replays",
	defaultDescription:
		"Free and open-source Formula 1 telemetry charts, head-to-head lap comparisons, and interactive session replays in your browser.",
	ogImage: "https://fullthrottle.chiroyce.dev/dashboard.png",
	ogImageAlt: "FullThrottle F1 Telemetry & Replay Dashboard",

	author: {
		name: "chiroyce",
		id: "https://chiroyce.dev/#person",
		url: "https://chiroyce.dev",
		description: "CSE undergrad and dev",
		sameAs: [
			"https://github.com/chiroyce1",
			"https://x.com/0xchiroyce",
			"https://youtube.com/@chiroyce",
		],
	},

	pages: {
		home: {
			path: "/",
			title: "FullThrottle — Free F1 Telemetry, Lap Analysis & Session Replays",
			description:
				"Free and open-source Formula 1 telemetry charts and interactive session replays in your browser. Compare driver traces, lap deltas, and telemetry synchronized with circuit maps.",
			changefreq: "daily",
			priority: "1.0",
		},
		telemetry: {
			path: "/telemetry",
			title: "F1 Telemetry Viewer & Lap Comparison",
			description:
				"Compare Formula 1 car telemetry traces side-by-side. Analyze throttle, brake, speed, RPM, gear shifts, and cornering deltas synced to circuit track maps.",
			changefreq: "weekly",
			priority: "0.9",
		},
		faq: {
			path: "/faq",
			title: "Frequently Asked Questions (FAQ)",
			description:
				"Answers to common questions about FullThrottle: FastF1 telemetry data sources, how to read speed and throttle traces, Lift & Coast (LiCO), open source license, and non-commercial status.",
			changefreq: "monthly",
			priority: "0.6",
			items: [
				{
					question: "Where does the data come from?",
					answer:
						"All data is sourced from FastF1, which pulls timing and telemetry data from live timing feeds and historical archives.",
				},
				{
					question: "How do I use the telemetry charts?",
					answer:
						"Hover over any chart to see the synchronized data across all graphs and the track map. You can zoom by clicking and dragging on a section of the chart. Double-click the chart to reset the zoom.",
				},
				{
					question: 'What is "LiCO"?',
					answer:
						"Lift and Coast is a technique used by drivers to manage battery recharging or tyre temperatures. On our charts, segments where the driver is off the throttle (<20%) and not braking are highlighted as LiCO events.",
				},
				{
					question: "Is this official?",
					answer:
						"No. FullThrottle is an unofficial, non-commercial project and is not associated in any way with the Formula 1 companies, Liberty Media, or Formula One Management. F1, FORMULA ONE, and related marks are trademarks of Formula One Licensing B.V.",
				},
				{
					question: "Is this open source?",
					answer:
						"Yes, FullThrottle is completely open-source under the AGPLv3 license on GitHub.",
				},
			],
		},
		settings: {
			path: "/settings",
			title: "Settings",
			description:
				"Customize telemetry display preferences, chart interpolation, and data sample rates for FullThrottle.",
			noindex: true,
		},
	},
} as const;

export type PageRouteKey = keyof typeof SITE_CONFIG.pages;

export const SITE_URL = SITE_CONFIG.url;
export const SITE_NAME = SITE_CONFIG.name;
export const DEFAULT_TITLE = SITE_CONFIG.defaultTitle;
export const DEFAULT_DESCRIPTION = SITE_CONFIG.defaultDescription;
export const DEFAULT_OG_IMAGE = SITE_CONFIG.ogImage;

export function getCanonicalUrl(path = ""): string {
	if (path.startsWith("http://") || path.startsWith("https://")) {
		return path;
	}
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return `${SITE_CONFIG.url}${cleanPath === "/" ? "" : cleanPath}`;
}

export function getAuthorSchema() {
	return {
		"@type": "Person",
		"@id": SITE_CONFIG.author.id,
		name: SITE_CONFIG.author.name,
		url: SITE_CONFIG.author.url,
		description: SITE_CONFIG.author.description,
		sameAs: [...SITE_CONFIG.author.sameAs],
	};
}

export function getWebsiteSchema() {
	const author = getAuthorSchema();
	return {
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: SITE_CONFIG.name,
		url: SITE_CONFIG.url,
		description: SITE_CONFIG.defaultDescription,
		applicationCategory: "SportsApplication",
		operatingSystem: "All",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		author,
		creator: author,
	};
}

export function getFaqSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: SITE_CONFIG.pages.faq.items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	};
}

export function getReplaySeo(meta: ReplaySessionMeta | null) {
	if (!meta) {
		return {
			title: `Session Replay — ${SITE_CONFIG.name}`,
			description:
				"Interactive Formula 1 session replay with live timing tower, track map car positions, and synchronized telemetry charts.",
			path: "/replay",
			schema: null,
		};
	}

	const loc = meta.circuit || meta.location || meta.country || "Formula 1";
	const title = `${meta.year} ${meta.roundName} - ${meta.sessionLabel} Replay — ${SITE_CONFIG.name}`;
	const description = `Interactive replay for the ${meta.year} ${meta.roundName} ${meta.sessionLabel} at ${loc}. Live timing leaderboard, track map car positions, and synchronized telemetry.`;
	const path = `/replay/${meta.year}/${meta.round}/${meta.sessionCode}`;

	const schema = {
		"@context": "https://schema.org",
		"@type": "SportsEvent",
		name: `${meta.year} ${meta.roundName} - ${meta.sessionLabel}`,
		sport: "Formula 1",
		url: getCanonicalUrl(path),
		...(meta.date ? { startDate: meta.date } : {}),
		...(meta.circuit || meta.country
			? {
					location: {
						"@type": "Place",
						name: meta.circuit || meta.country,
						...(meta.country
							? {
									address: {
										"@type": "PostalAddress",
										addressCountry: meta.country,
									},
								}
							: {}),
					},
				}
			: {}),
		description,
		organizer: {
			"@type": "Organization",
			name: SITE_CONFIG.name,
			url: SITE_CONFIG.url,
		},
	};

	return {
		title,
		description,
		path,
		schema,
	};
}
