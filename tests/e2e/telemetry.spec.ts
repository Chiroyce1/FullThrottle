import { test, expect, type Page } from "@playwright/test";

const TELEMETRY = "/telemetry?s=2026~18~r~12~55,2026~18~r~16~42";

async function open(page: Page) {
	await page.goto(TELEMETRY);
	await page.locator("svg path[stroke]").first().waitFor({ timeout: 30_000 });
}

const speedChart = (page: Page) => page.locator("svg[style*='crosshair']").first();

test.describe("telemetry (desktop)", () => {
	test.skip(({ isMobile }) => isMobile, "desktop layout");

	test("hover shows live speeds and the map cursor", async ({ page }) => {
		await open(page);
		const box = (await speedChart(page).boundingBox())!;
		await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
		await expect(page.getByRole("columnheader", { name: "Speed" })).toBeVisible();
		await expect(page.locator("text=/\\d+ km\\/h/").first()).toBeVisible();
	});

	test("selecting a corner zooms, reset zoom clears it", async ({ page }) => {
		await open(page);
		await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveCount(0);
		await page.getByRole("button", { name: /^T7\b/ }).click();
		await expect(page.getByRole("button", { name: "Reset zoom" })).toBeVisible();
		await page.getByRole("button", { name: "Reset zoom" }).click();
		await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveCount(0);
	});

	test("drag to zoom", async ({ page }) => {
		await open(page);
		const box = (await speedChart(page).boundingBox())!;
		const y = box.y + box.height / 2;
		await page.mouse.move(box.x + box.width * 0.3, y);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
		await page.mouse.up();
		await expect(page.getByRole("button", { name: "Reset zoom" })).toBeVisible();
	});

	test("view toggles: corner lines and min-speed dots", async ({ page }) => {
		await open(page);
		const dots = page.locator(".apex-markers-layer");
		const minSpeeds = page.getByRole("button", { name: "Min speeds" });
		await expect(dots).toHaveCount(1);
		await minSpeeds.click();
		await expect(minSpeeds).toHaveAttribute("aria-pressed", "false");
		await expect(dots).toHaveCount(0);
		// The corner table stays: it is its own panel, not a chart overlay.
		await expect(page.getByText("Corner speeds")).toBeVisible();
		const corners = page.getByRole("button", { name: "Corners", exact: true });
		await corners.click();
		await expect(corners).toHaveAttribute("aria-pressed", "false");
	});

	test("driver chips: add, edit and remove", async ({ page }) => {
		await open(page);
		const chips = page.getByRole("button", { name: /^Driver [A-D]:/ });
		await expect(chips).toHaveCount(2);
		await expect(chips.first()).toContainText("ANT");

		// Adding pre-fills the next driver from the loaded session.
		await page.getByRole("button", { name: "Add driver" }).click();
		await expect(chips).toHaveCount(3);
		await expect(chips.nth(2)).not.toContainText("Driver C: not set");

		await chips.nth(2).click();
		await expect(page.getByText("Compare from another session…")).toBeVisible();
		await page.getByRole("button", { name: "Remove" }).click();
		await expect(chips).toHaveCount(2);
	});

	test("changing the session moves every driver on it and asks to load", async ({ page }) => {
		await open(page);
		await expect(page.getByRole("button", { name: "Load telemetry" })).toHaveCount(0);
		await page.getByRole("combobox").filter({ hasText: "Race" }).click();
		await page.getByRole("option", { name: "Qualifying" }).click();
		// The charts clear and one Load button offers the new session.
		await expect(page.getByRole("button", { name: "Load telemetry" })).toHaveCount(1);
		// Both drivers followed the main session: no chip shows another session's tag.
		await expect(page.getByRole("button", { name: /^Driver [AB]:/ }).getByText(/2026 .* R$/)).toHaveCount(0);
	});

	test("share copies a link that reproduces the comparison", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await open(page);
		await page.getByRole("button", { name: "Share" }).click();
		await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
		const url = await page.evaluate(() => navigator.clipboard.readText());
		expect(url).toContain("/telemetry?s=2026~18~r~12~55,2026~18~r~16~42");
	});
});

test.describe("telemetry (mobile)", () => {
	test.skip(({ isMobile }) => !isMobile, "mobile layout");

	test("one page: session bar, map, charts and corners", async ({ page }) => {
		await open(page);
		await expect(page.getByRole("button", { name: /^Driver [AB]:/ })).toHaveCount(2);
		for (const region of ["Lap summary", "Track map", "Telemetry charts", "Corner speeds"]) {
			await expect(page.getByRole("region", { name: region })).toBeAttached();
		}
	});
});
