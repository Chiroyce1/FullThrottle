import { test, expect, type Page } from "@playwright/test";

const REPLAY = "/replay/2026/18/r";

async function open(page: Page) {
	await page.goto(REPLAY);
	await page.getByRole("button", { name: "Play" }).waitFor({ timeout: 30_000 });
}

const clock = (page: Page) => page.locator("text=/^\\d\\d:\\d\\d:\\d\\d\\.\\d$/").first();

async function seek(page: Page, fraction: number) {
	await page.getByRole("slider", { name: "Session time" }).evaluate((el, f) => {
		const input = el as HTMLInputElement;
		input.value = String(Number(input.min) + (Number(input.max) - Number(input.min)) * f);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	}, fraction);
}

test("play advances the clock, pause stops it", async ({ page }) => {
	await open(page);
	const start = await clock(page).textContent();
	await page.getByRole("button", { name: "Play" }).click();
	await page.waitForTimeout(1500);
	await page.getByRole("button", { name: "Pause" }).click();
	const paused = await clock(page).textContent();
	expect(paused).not.toBe(start);
	await page.waitForTimeout(600);
	expect(await clock(page).textContent()).toBe(paused);
});

test("seeking updates the race state", async ({ page }) => {
	await open(page);
	await seek(page, 0.5);
	await expect(page.getByText(/^Lap \d+\/56$/)).not.toHaveText("Lap 1/56");
	// Leaderboard has a header row and the leader row is labelled, not "GAP/INT"
	await expect(page.getByText("Leader", { exact: true })).toBeVisible();
	await expect(page.getByText("GAP", { exact: true })).toHaveCount(0);
});

test("current lap is not shown before the race starts", async ({ page }) => {
	await open(page);
	await expect(page.getByText(/Current\s+–/)).toBeVisible();
});

test("clicking a leaderboard row focuses that driver", async ({ page }) => {
	await open(page);
	const row = page.getByRole("button", { name: /Leclerc|LEC/ }).first();
	await row.click();
	await expect(row).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByText("#16")).toBeVisible();
});

test("speed selector and map options", async ({ page }) => {
	await open(page);
	await page.getByRole("combobox").selectOption("10");
	await expect(page.getByRole("combobox")).toHaveValue("10");
	const corners = page.getByRole("button", { name: "Corners", exact: true });
	await corners.click();
	await expect(corners).toHaveAttribute("aria-pressed", "true");
});

test("mobile stacks every panel on one page", async ({ page, isMobile }) => {
	test.skip(!isMobile, "mobile only");
	await open(page);
	await expect(page.getByRole("tab")).toHaveCount(0);
	await expect(page.getByText("Live timing")).toBeVisible();
	await expect(page.getByRole("button", { name: "Focused only" })).toBeVisible();
});

test("lap traces follow the focused driver", async ({ page }) => {
	await open(page);
	await seek(page, 0.5);
	for (const label of ["Speed", "Throttle", "Brake", "RPM"]) {
		await expect(page.getByText(new RegExp(`^${label}\\b`)).first()).toBeVisible();
	}
	await expect(page.getByText(/^Gear\b/)).toHaveCount(0);
});
