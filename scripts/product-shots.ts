import { test, type Page } from "@playwright/test";

// Brazil 2026 race, lap 67: VER against NOR.
const COMPARISON = "/telemetry?s=2026~20~r~3~67,2026~20~r~1~67";

async function capture(page: Page, path: string) {
	await page.goto(COMPARISON);
	await page.locator("svg path[stroke]").first().waitFor({ timeout: 30_000 });
	await page.waitForLoadState("networkidle");
	await page.evaluate(() => document.fonts.ready);
	// Hover T12 so the shot shows the live readout, map cursor and corner summary.
	await page.getByRole("button", { name: /^T12\b/ }).hover();
	await page.waitForTimeout(600);
	await page.screenshot({ path });
}

test("landing preview (static/dashboard_preview.png)", async ({ browser }) => {
	const page = await browser.newPage({ viewport: { width: 1391, height: 781 }, deviceScaleFactor: 2 });
	await capture(page, "static/dashboard_preview.png");
});

// Link previews (og:image): the landing hero's wordmark and pitch over the
// product shot above, in the app's own fonts and colours. Run after the
// landing preview so it shows the fresh shot.
test("social card (static/og.png)", async ({ browser }) => {
	const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
	await page.goto("/");
	await page.evaluate(async () => {
		document.documentElement.classList.add("dark");
		document.body.innerHTML = `
			<div style="position:fixed;inset:0;overflow:hidden;background:var(--background);font-family:var(--font-sans)">
				<div style="position:absolute;left:64px;top:56px;right:64px;display:flex;align-items:flex-end;justify-content:space-between;gap:48px">
					<div>
						<p style="margin:0;font-size:18px;color:var(--muted-foreground)">Built by <span style="color:var(--foreground);font-weight:500">chiroyce</span></p>
						<h1 style="margin:10px 0 0;font-size:104px;line-height:0.9;font-weight:800;letter-spacing:-0.045em;color:var(--foreground)">Full<span style="color:var(--primary)">Throttle</span></h1>
					</div>
					<p style="margin:0 0 6px;max-width:400px;font-size:24px;line-height:1.35;color:var(--muted-foreground)">F1 telemetry and session replays in your browser.</p>
				</div>
				<div style="position:absolute;left:64px;top:232px;width:1180px;padding:6px;border:1px solid var(--border-strong);border-radius:12px;background:var(--card)">
					<img src="/dashboard_preview.png" style="display:block;width:100%;border-radius:6px">
				</div>
			</div>`;
		await document.fonts.ready;
		await Promise.all([...document.images].map((img) => img.decode()));
	});
	await page.screenshot({ path: "static/og.png" });
});
