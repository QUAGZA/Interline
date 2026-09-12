# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: public-pages.spec.ts >> Public pages without a wallet >> landing does not require connect
- Location: tests\e2e\public-pages.spec.ts:4:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Public pages without a wallet", () => {
  4  |   test("landing does not require connect", async ({ page }) => {
  5  |     const res = await page.goto("/");
> 6  |     expect(res?.ok()).toBeTruthy();
     |                       ^ Error: expect(received).toBeTruthy()
  7  |     await expect(page).not.toHaveURL(/\/connect/);
  8  |   });
  9  | 
  10 |   test("public desk is reachable disconnected", async ({ page }) => {
  11 |     const res = await page.goto("/desk");
  12 |     expect(res?.ok()).toBeTruthy();
  13 |     await expect(page).not.toHaveURL(/\/connect/);
  14 |   });
  15 | 
  16 |   test("markets table is public", async ({ page }) => {
  17 |     const res = await page.goto("/markets");
  18 |     expect(res, "Wave 6 /markets route").toBeTruthy();
  19 |     expect(res!.status(), "GET /markets").toBeLessThan(400);
  20 |     await expect(page).not.toHaveURL(/\/connect/);
  21 |   });
  22 | 
  23 |   test("dashboard disconnected empty state does not loop to connect", async ({ page }) => {
  24 |     const res = await page.goto("/dashboard");
  25 |     if (!res || res.status() >= 400) {
  26 |       test.info().annotations.push({ type: "gap", description: "/dashboard missing" });
  27 |       expect(res?.status() ?? 404, "Wave 6 /dashboard").toBeLessThan(400);
  28 |       return;
  29 |     }
  30 |     await expect(page).not.toHaveURL(/\/connect/);
  31 |   });
  32 | });
  33 | 
```