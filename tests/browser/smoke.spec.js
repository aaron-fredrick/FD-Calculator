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
  await expect(page.locator("#accounts-list .account")).not.toHaveClass(/is-entering/);
  const dimensions = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const rect = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { width: Math.round(box.width), scrollWidth: element.scrollWidth };
    };
    const offenders = [...document.querySelectorAll("body *")].filter(element => {
      const box = element.getBoundingClientRect();
      return box.right > viewport + 1 && !element.closest(".rail") &&
        !["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(element).overflowX);
    }).map(element => ({
      tag: element.tagName.toLowerCase(),
      id: element.id,
      className: typeof element.className === "string" ? element.className : "",
      right: Math.round(element.getBoundingClientRect().right)
    }));
    return {
      viewport,
      main: rect("main"),
      content: rect(".content"),
      form: rect("#scenario-form"),
      offenders,
      internalOverflow: [...document.querySelector(".content").querySelectorAll("*")]
        .filter(element => element.scrollWidth > element.clientWidth + 1)
        .map(element => ({
          tag: element.tagName.toLowerCase(), id: element.id,
          className: typeof element.className === "string" ? element.className : "",
          width: element.clientWidth, scrollWidth: element.scrollWidth,
          overflowX: getComputedStyle(element).overflowX
        })).slice(0, 20)
    };
  });
  // The section rail is intentionally horizontally scrollable; main content is not.
  expect(dimensions.main.width).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.content.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.content.width + 1);
  expect(dimensions.form.scrollWidth).toBeLessThanOrEqual(dimensions.content.width + 1);
  expect(dimensions.offenders).toEqual([]);
});

test("keyboard focus and reduced-motion preferences are respected", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/web/");
  await page.keyboard.press("Tab");

  const focus = await page.evaluate(() => {
    const element = document.activeElement;
    return {
      tag: element?.tagName ?? "",
      name: element?.getAttribute("aria-label") || element?.textContent?.trim() || element?.getAttribute("title") || ""
    };
  });
  expect(focus.tag).not.toBe("BODY");
  expect(focus.name.length).toBeGreaterThan(0);

  const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  expect(scrollBehavior).toBe("auto");
  await expect(page.locator("#accounts-list .account")).not.toHaveClass(/is-entering/);
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
  await reportPage.evaluate(() => {
    const details = document.createElement("details");
    details.className = "collapsible-table print-stress-case";
    details.innerHTML = '<summary>Long-label print stress case</summary><div class="table-wrap"><table><thead><tr><th scope="col">Bank and product</th><th scope="col">Rate source</th><th scope="col">Eligibility conditions</th><th scope="col">Payout terms</th></tr></thead><tbody><tr><td></td><td></td><td></td><td></td></tr></tbody></table></div>';
    const cells = details.querySelectorAll("tbody td");
    cells[0].textContent = "Bank product label ".repeat(18);
    cells[1].textContent = "https://example.invalid/rate-source/".repeat(10);
    cells[2].textContent = "Eligibility and minimum-deposit conditions ".repeat(16);
    cells[3].textContent = "Monthly interest payout at each scheduled interval ".repeat(14);
    document.body.append(details);
  });
  const tableSemantics = await reportPage.evaluate(() => ({
    tablesWithoutColumnHeaders: [...document.querySelectorAll("table")]
      .filter(table => !table.querySelector("thead th[scope=col]")).length
  }));
  expect(tableSemantics.tablesWithoutColumnHeaders).toBe(0);

  await reportPage.setViewportSize({ width: 320, height: 800 });
  const screenOverflow = await reportPage.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  expect(screenOverflow.documentWidth).toBeLessThanOrEqual(screenOverflow.viewportWidth + 1);

  await reportPage.emulateMedia({ media: "print" });
  expect(await reportPage.evaluate(() => window.matchMedia("print").matches)).toBe(true);
  const printTableLayout = await reportPage.evaluate(() => {
    const details = document.querySelector("details.print-stress-case");
    const tableWrap = details?.querySelector(".table-wrap");
    const table = tableWrap?.querySelector("table");
    const rect = element => element ? {
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      minWidth: getComputedStyle(element).minWidth,
      boxSizing: getComputedStyle(element).boxSizing
    } : null;
    return {
      tableWrapDisplay: tableWrap ? getComputedStyle(tableWrap).display : "missing",
      tableMinWidth: table ? getComputedStyle(table).minWidth : "missing",
      tableWidth: table ? table.getBoundingClientRect().width : 0,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      body: rect(document.body),
      appShell: rect(document.querySelector(".app-shell")),
      main: rect(document.querySelector("main")),
      details: rect(details),
      tableWrap: rect(tableWrap),
      tableComputed: table ? {
        width: getComputedStyle(table).width,
        maxWidth: getComputedStyle(table).maxWidth,
        layout: getComputedStyle(table).tableLayout,
        display: getComputedStyle(table).display,
        overflowWrap: getComputedStyle(table).overflowWrap
      } : null,
      cells: table ? [...table.querySelectorAll("th,td")].slice(0,8).map(cell => ({
        width: cell.getBoundingClientRect().width,
        minWidth: getComputedStyle(cell).minWidth,
        maxWidth: getComputedStyle(cell).maxWidth,
        whiteSpace: getComputedStyle(cell).whiteSpace,
        overflowWrap: getComputedStyle(cell).overflowWrap,
        wordBreak: getComputedStyle(cell).wordBreak
      })) : [],
      reportTableWidths: [...document.querySelectorAll("main .collapsible-table .table-wrap table")]
        .map(item => item.getBoundingClientRect().width)
    };
  });
  expect(printTableLayout.tableWrapDisplay).toBe("block");
  expect(printTableLayout.tableMinWidth).toBe("0px");
  expect(printTableLayout.tableWidth, JSON.stringify(printTableLayout)).toBeLessThanOrEqual(printTableLayout.viewportWidth + 1);
  await expect(reportPage.locator("body")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
