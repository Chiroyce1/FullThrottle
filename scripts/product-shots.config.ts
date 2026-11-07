/**
 * Recaptures the product screenshots in static/ from the running app:
 *   bunx playwright test -c scripts/product-shots.config.ts
 * Run it after visible changes to the telemetry page.
 */
import { defineConfig } from "@playwright/test";

const port = Number(process.env.VISUAL_PORT ?? 5174);

export default defineConfig({
	testDir: ".",
	testMatch: "product-shots.ts",
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${port}`,
		channel: "chrome",
		colorScheme: "dark",
		contextOptions: { reducedMotion: "reduce" },
	},
	webServer: {
		command: `bunx vite dev --port ${port} --strictPort`,
		url: `http://localhost:${port}`,
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
