import type { RequestHandler } from "./$types";
import { SITE_CONFIG, SITE_URL } from "$lib/seo";
import { allYears } from "$lib/metadata-index";

export const prerender = true;

export const GET: RequestHandler = async () => {
	const staticPages = [
		SITE_CONFIG.pages.home,
		SITE_CONFIG.pages.telemetry,
		SITE_CONFIG.pages.faq,
	];

	const urls: string[] = [];

	for (const page of staticPages) {
		const path = page.path === "/" ? "" : page.path;
		urls.push(`  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
	}

	for (const yearEntry of allYears) {
		for (const round of yearEntry.rounds) {
			for (const session of round.sessions) {
				const path = `/replay/${yearEntry.year}/${round.round}/${session.code}`;
				let priority = "0.6";
				const code = session.code.toLowerCase();
				if (code === "r") {
					priority = "0.8";
				} else if (code === "q" || code === "s" || code === "sq") {
					priority = "0.7";
				}

				const lastmodTag =
					round.date && /^\d{4}-\d{2}-\d{2}$/.test(round.date)
						? `\n    <lastmod>${round.date}</lastmod>`
						: "";

				urls.push(`  <url>
    <loc>${SITE_URL}${path}</loc>${lastmodTag}
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`);
			}
		}
	}

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`.trim();

	return new Response(xml, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=0, s-maxage=86400",
		},
	});
};
