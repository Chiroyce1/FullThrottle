import { test, expect } from "@playwright/test";

test("switches persist across reloads and reset restores defaults", async ({ page }) => {
	await page.goto("/settings");
	await page.waitForLoadState("networkidle");
	const speed = page.getByRole("switch", { name: "Speed interpolation" });
	await expect(speed).toHaveAttribute("aria-checked", "true");
	await speed.click();
	await expect(speed).toHaveAttribute("aria-checked", "false");

	await page.reload();
	await page.waitForLoadState("networkidle");
	await expect(speed).toHaveAttribute("aria-checked", "false");

	await page.getByRole("button", { name: "Reset to defaults" }).click();
	await expect(speed).toHaveAttribute("aria-checked", "true");
});

test("LiCO threshold defaults to 20% and is stored", async ({ page }) => {
	await page.goto("/settings");
	await page.waitForLoadState("networkidle");
	await expect(page.getByRole("combobox").filter({ hasText: "20%" })).toBeVisible();
	await page.getByRole("combobox").filter({ hasText: "20%" }).click();
	await page.getByRole("option", { name: "50%" }).click();
	const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ft_settings") ?? "{}"));
	expect(stored.licoThrottleSensitivity).toBe(50);
});
