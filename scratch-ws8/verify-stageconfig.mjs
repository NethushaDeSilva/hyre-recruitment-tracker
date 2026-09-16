import { chromium } from "playwright";
const BASE = "http://localhost:5173";

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("cv-extract") && !m.text().includes("500")) errors.push(m.text()); });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').fill("hr@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/positions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.locator("a[href^='/positions/']").first().click();
  await page.waitForTimeout(2000);
  console.log("position URL:", page.url());

  await page.getByRole("button", { name: /Configure stages/i }).click();
  await page.waitForTimeout(800);
  // move past step 0 (pipeline) into the first assignment step
  await page.getByRole("button", { name: /Assign people|Proceed/i }).click();
  await page.waitForTimeout(1500); // let availability fetch resolve

  await page.screenshot({ path: "scratch-ws8/sc-1-initial.png" });

  const before = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("ul > li button")];
    return rows.slice(0, 4).map((r) => r.textContent.replace(/\s+/g, " ").trim());
  });
  console.log("Rows BEFORE any click:\n" + before.join("\n"));

  // click the first selectable row's checkbox to create a pending change
  const firstRow = page.locator("ul > li button").first();
  await firstRow.click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("ul > li button")];
    return rows.slice(0, 4).map((r) => r.textContent.replace(/\s+/g, " ").trim());
  });
  console.log("\nRows AFTER ticking the first one:\n" + after.join("\n"));

  await page.screenshot({ path: "scratch-ws8/sc-2-after-tick.png" });

  // zoom checks
  for (const zoom of [200, 400]) {
    await page.setViewportSize({ width: Math.round(1440 / (zoom / 100)), height: 900 });
    await page.waitForTimeout(400);
    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    console.log(`zoom ${zoom}%: bodyOverflow=`, bodyOverflow);
    await page.screenshot({ path: `scratch-ws8/sc-${zoom}pct.png`, fullPage: true });
  }

  console.log("\nErrors:", errors.length ? errors : "none");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
