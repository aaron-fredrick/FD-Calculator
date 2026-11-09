import { test, expect } from "@playwright/test";

test("production web app loads and privacy preferences can be changed", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/web/");
  await expect(page).toHaveTitle(/FD Cal/);
  await expect(page.locator("#run")).toBeVisible();

  const banner = page.locator("#privacy-banner");
  await expect(banner).toBeVisible();
  await page.locator("#privacy-reject").click();

  await page.locator("#open-privacy-preferences").click();
  const dialog = page.locator("#privacy-preferences-dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#privacy-analytics").check();
  await page.locator("#privacy-save").click();
  await expect(dialog).toBeHidden();

  const saved = await page.evaluate(() => JSON.parse(
    localStorage.getItem("fd-cal:privacy-preferences:v1")
  ));
  expect(saved).toMatchObject({ version: 1, necessary: true, analytics: true });

  await page.locator("#open-privacy-preferences").click();
  await expect(page.locator("#privacy-analytics")).toBeChecked();
  await page.locator("#privacy-close").click();
  expect(pageErrors).toEqual([]);
});

test("legal pages expose private contact details and can be navigated", async ({ page }) => {
  await page.goto("/web/");
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.locator('a[href="mailto:a.n.r.fredrick@gmail.com"]')).toBeVisible();

  await page.getByRole("link", { name: /terms & conditions/i }).click();
  await expect(page.getByRole("heading", { name: "Terms & Conditions" })).toBeVisible();
  await expect(page.locator('a[href="mailto:a.n.r.fredrick@gmail.com"]')).toBeVisible();
});

test("dev preview is path-prefixed and marked noindex", async ({ page }) => {
  await page.goto("/FD-Calculator/dev/web/");
  await expect(page).toHaveTitle(/FD Cal/);
  await expect(page.locator(".dev-preview-banner")).toContainText("DEV PREVIEW");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href", "https://aaron-fredrick.github.io/FD-Calculator/dev/web/"
  );
});

test("mobile viewport renders without document-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/web/");
  await expect(page.locator("#run")).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")].map(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: typeof element.className === "string" ? element.className : "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        overflowX: style.overflowX,
      };
    }).filter(item => item.right > viewport + 1 && !["auto", "scroll", "hidden", "clip"].includes(item.overflowX))
      .sort((a, b) => b.right - a.right).slice(0, 12);
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width) };
    };
    return {
      viewport, content: document.documentElement.scrollWidth, offenders,
      containers: Object.fromEntries(["html", "body", "main", ".layout", ".rail", ".content", "#scenario-form", "#accounts"].map(selector => [selector, rect(selector)]))
    };
  });
  expect(dimensions.content, JSON.stringify(dimensions.offenders)).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("a default scenario runs and produces an independently openable HTML report", async ({ page, context }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto("/web/");
  await expect(page.locator("#run")).toBeVisible();
  await expect(page.locator("#accounts-list .account")).toHaveCount(1);
  await page.locator("#accounts-list [data-balance]").fill("1000000");
  await page.locator("#strategy-choice").selectOption("greedy");
  await page.locator("#run").click();
  await expect(page.locator("#results")).toBeVisible({ timeout: 25_000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download-report").click(),
  ]);
  const reportPath = await download.path();
  expect(reportPath).toBeTruthy();

  const reportPage = await context.newPage();
  await reportPage.goto("file://" + reportPath);
  await expect(reportPage.locator("body")).toContainText("Simulation Report");
  expect(pageErrors).toEqual([]);
});
