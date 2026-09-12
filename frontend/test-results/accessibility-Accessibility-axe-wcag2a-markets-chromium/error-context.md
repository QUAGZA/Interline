# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> Accessibility >> axe wcag2a /markets
- Location: tests\e2e\accessibility.spec.ts:33:9

# Error details

```
Error: /markets

expect(received).toBeLessThan(expected)

Expected: < 400
Received:   500
```

# Page snapshot

```yaml
- alert [ref=e1]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import AxeBuilder from "@axe-core/playwright";
  3  | 
  4  | const routes = ["/", "/desk", "/markets", "/dashboard"];
  5  | 
  6  | test.describe("Accessibility", () => {
  7  |   test("keyboard can reach a document link or button", async ({ page }) => {
  8  |     await page.goto("/");
  9  |     await page.keyboard.press("Tab");
  10 |     const focused = await page.evaluate(() => {
  11 |       const el = document.activeElement as HTMLElement | null;
  12 |       if (!el) return { tag: "", name: "" };
  13 |       return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || "").trim() };
  14 |     });
  15 |     expect(focused.tag).not.toBe("BODY");
  16 |   });
  17 | 
  18 |   test("320px width does not require horizontal document scroll on landing", async ({ page }) => {
  19 |     await page.setViewportSize({ width: 320, height: 640 });
  20 |     await page.goto("/");
  21 |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  22 |     expect(overflow).toBeFalsy();
  23 |   });
  24 | 
  25 |   test("reduced motion media is honored by the document", async ({ page }) => {
  26 |     await page.emulateMedia({ reducedMotion: "reduce" });
  27 |     await page.goto("/");
  28 |     const pref = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  29 |     expect(pref).toBeTruthy();
  30 |   });
  31 | 
  32 |   for (const path of routes) {
  33 |     test(`axe wcag2a ${path}`, async ({ page }) => {
  34 |       const res = await page.goto(path);
  35 |       if (!res || res.status() >= 400) {
  36 |         test.info().annotations.push({ type: "gap", description: `${path} not implemented` });
> 37 |         expect(res?.status() ?? 404, path).toBeLessThan(400);
     |                                            ^ Error: /markets
  38 |         return;
  39 |       }
  40 |       const results = await new AxeBuilder({ page }).withTags(["wcag2a"]).analyze();
  41 |       const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  42 |       expect(serious, serious.map((v) => v.id).join(", ")).toEqual([]);
  43 |     });
  44 |   }
  45 | 
  46 |   test("focus does not leave a dialog when one is open", async ({ page }) => {
  47 |     await page.goto("/");
  48 |     const dialog = page.getByRole("dialog");
  49 |     const trigger = page.getByRole("button").first();
  50 |     if (await trigger.count()) await trigger.focus();
  51 |     if (!(await dialog.count())) {
  52 |       test.info().annotations.push({ type: "note", description: "no dialog on landing; trap covered when Wave 6 connect modal exists" });
  53 |       return;
  54 |     }
  55 |     await expect(dialog.first()).toBeVisible();
  56 |   });
  57 | });
  58 | 
```