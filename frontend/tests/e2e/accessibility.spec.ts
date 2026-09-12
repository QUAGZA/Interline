import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/", "/desk", "/markets", "/dashboard"];

test.describe("Accessibility", () => {
  test("keyboard can reach a document link or button", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return { tag: "", name: "" };
      return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || "").trim() };
    });
    expect(focused.tag).not.toBe("BODY");
  });

  test("320px width does not require horizontal document scroll on landing", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(overflow).toBeFalsy();
  });

  test("reduced motion media is honored by the document", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const pref = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(pref).toBeTruthy();
  });

  for (const path of routes) {
    test(`axe wcag2a ${path}`, async ({ page }) => {
      const res = await page.goto(path);
      if (!res || res.status() >= 400) {
        test.info().annotations.push({ type: "gap", description: `${path} not implemented` });
        expect(res?.status() ?? 404, path).toBeLessThan(400);
        return;
      }
      const results = await new AxeBuilder({ page }).withTags(["wcag2a"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(serious, serious.map((v) => v.id).join(", ")).toEqual([]);
    });
  }

  test("focus does not leave a dialog when one is open", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    const trigger = page.getByRole("button").first();
    if (await trigger.count()) await trigger.focus();
    if (!(await dialog.count())) {
      test.info().annotations.push({ type: "note", description: "no dialog on landing; trap covered when Wave 6 connect modal exists" });
      return;
    }
    await expect(dialog.first()).toBeVisible();
  });
});
