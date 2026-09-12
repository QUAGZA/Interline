import { test, expect } from "@playwright/test";

test.describe("Public pages without a wallet", () => {
  test("landing does not require connect", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.ok()).toBeTruthy();
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("public desk is reachable disconnected", async ({ page }) => {
    const res = await page.goto("/desk");
    expect(res?.ok()).toBeTruthy();
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("markets table is public", async ({ page }) => {
    const res = await page.goto("/markets");
    expect(res, "Wave 6 /markets route").toBeTruthy();
    expect(res!.status(), "GET /markets").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("dashboard disconnected empty state does not loop to connect", async ({ page }) => {
    const res = await page.goto("/dashboard");
    if (!res || res.status() >= 400) {
      test.info().annotations.push({ type: "gap", description: "/dashboard missing" });
      expect(res?.status() ?? 404, "Wave 6 /dashboard").toBeLessThan(400);
      return;
    }
    await expect(page).not.toHaveURL(/\/connect/);
  });
});
