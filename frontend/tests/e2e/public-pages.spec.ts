import { test, expect } from "@playwright/test";

const nav = { waitUntil: "domcontentloaded" as const };

test.describe("Public pages without a wallet", () => {
  test("landing does not require connect", async ({ page }) => {
    const res = await page.goto("/", nav);
    expect(res?.status() ?? 500, "GET /").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("public desk is reachable disconnected", async ({ page }) => {
    const res = await page.goto("/desk", nav);
    expect(res?.status() ?? 500, "GET /desk").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("markets table is public", async ({ page }) => {
    const res = await page.goto("/markets", nav);
    expect(res, "Wave 6 /markets route").toBeTruthy();
    expect(res!.status(), "GET /markets").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("direct workspace is public", async ({ page }) => {
    const res = await page.goto("/direct", nav);
    expect(res?.status() ?? 500, "GET /direct").toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/connect/);
  });

  test("market actions expose owner repay and remove collateral", async ({ page }) => {
    const res = await page.goto("/markets/31337/usdc-weth-wallet", nav);
    expect(res?.status() ?? 500, "GET /markets/31337/usdc-weth-wallet").toBeLessThan(400);
    await expect(page.getByRole("button", { name: /^repay$/i })).toBeVisible();
    await page.getByRole("button", { name: /^repay$/i }).click();
    await expect(page.getByRole("button", { name: /repay partial/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /repay all/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /remove collateral/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /supply amount/i })).toHaveCount(0);
  });

  test("public position copy says the owner can repay", async ({ page }) => {
    const owner = "0x0000000000000000000000000000000000000001";
    const res = await page.goto(`/positions/31337/usdc-weth-wallet/${owner}`, nav);
    expect(res?.status() ?? 500).toBeLessThan(400);
    await expect(page.getByText(/owner can repay/i)).toBeVisible();
    await expect(page.getByText(/third parties may repay/i)).toBeVisible();
  });
});
