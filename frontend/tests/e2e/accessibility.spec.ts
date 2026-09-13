import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/", "/desk", "/markets", "/dashboard", "/direct"];

test.describe("Accessibility", () => {
  test("keyboard can reach a document link or button", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    let tag = "BODY";
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      tag = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.tagName ?? "BODY");
      if (tag !== "BODY" && tag !== "HTML") break;
    }
    expect(tag).not.toBe("BODY");
    expect(tag).not.toBe("HTML");
  });

  test("320px width does not require horizontal document scroll on landing", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(overflow).toBeFalsy();
  });

  test("reduced motion skips gsap and landing animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const pref = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(pref).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
    await expect(page.locator("html")).toHaveAttribute("data-gsap", "skipped");
    const flap = page.getByLabel("INTERLINE").first();
    if (await flap.count()) {
      await expect(flap).toHaveAttribute("data-motion", "static");
    }
  });

  for (const path of routes) {
    test(`axe wcag2a ${path}`, async ({ page }) => {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      if (!res || res.status() >= 400) {
        test.info().annotations.push({ type: "gap", description: `${path} not implemented` });
        expect(res?.status() ?? 404, path).toBeLessThan(400);
        return;
      }
      const results = await new AxeBuilder({ page }).withTags(["wcag2a"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join(", ")).toEqual([]);
    });
  }

  test("focus does not leave a dialog when one is open", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /about this page/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          return Boolean(d && d.contains(document.activeElement));
        }),
      )
      .toBeTruthy();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        return Boolean(d && d.contains(document.activeElement));
      });
      expect(inside, `tab ${i} left the dialog`).toBeTruthy();
    }
  });
});
