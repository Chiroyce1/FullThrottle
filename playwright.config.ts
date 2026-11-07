import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression safety net for UI refactors.
 * Uses the system Chrome (no browser download) and local dev data
 * (static/data), so screenshots are deterministic.
 *
 *   bun run test:visual            compare against baselines
 *   bun run test:visual --update-snapshots   re-record (review the diff first!)
 */
const port = Number(process.env.VISUAL_PORT ?? 5174);

const themed = (scheme: "dark" | "light") => ({
	colorScheme: scheme,
	storageState: {
		cookies: [],
		origins: [
			{
				origin: `http://localhost:${port}`,
				localStorage: [{ name: "mode-watcher-mode", value: scheme }],
			},
		],
	},
});

export default defineConfig({
	testDir: "tests",
	snapshotPathTemplate: "{testDir}/visual/__screenshots__/{projectName}/{arg}{ext}",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	expect: {
		toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" },
	},
	use: {
		baseURL: `http://localhost:${port}`,
		channel: "chrome",
		// Scroll reveals stay off so full-page screenshots capture everything.
		contextOptions: { reducedMotion: "reduce" },
	},
	projects: [
		{
			name: "desktop-dark",
			use: { viewport: { width: 1440, height: 900 }, ...themed("dark") },
		},
		{
			name: "desktop-light",
			use: { viewport: { width: 1440, height: 900 }, ...themed("light") },
		},
		{
			name: "mobile-dark",
			use: { ...devices["Pixel 7"], channel: "chrome", ...themed("dark") },
		},
	],
	webServer: {
		command: `bunx vite dev --port ${port} --strictPort`,
		url: `http://localhost:${port}`,
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
