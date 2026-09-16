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
  await page.waitForTimeout(3000);
  console.log("post-login URL:", page.url());
  await page.goto(`${BASE}/schedule`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  // 100% — full page + zoomed crop on the legend for the unknown row
  await page.screenshot({ path: "scratch-ws8/cal-100pct-full.png", fullPage: true });

  const legendInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("aside, [class*='w-64'] > div, div")]
      .filter((el) => el.textContent.includes("Rehan Silva") || el.textContent.includes("Dilani Perera"));
    return rows.slice(0, 4).map((r) => r.textContent.trim().slice(0, 140));
  });
  console.log("Legend text matches:", JSON.stringify(legendInfo, null, 2));

  // Zoom levels via viewport-shrink technique (WCAG 1.4.10 definition)
  for (const zoom of [200, 400]) {
    await page.setViewportSize({ width: Math.round(1440 / (zoom / 100)), height: 900 });
    await page.waitForTimeout(400);
    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    console.log(`zoom ${zoom}%: bodyOverflow=`, bodyOverflow);
    await page.screenshot({ path: `scratch-ws8/cal-${zoom}pct.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("Errors:", errors.length ? errors : "none");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
