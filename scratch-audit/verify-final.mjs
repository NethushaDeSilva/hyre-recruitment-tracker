import { chromium } from "playwright";

const BASE = "https://hyre-hiring.pages.dev";

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').fill("hr@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2000);

  for (const w of [{ l: "100pct", w: 1440 }, { l: "150pct", w: 960 }, { l: "200pct", w: 720 }, { l: "400pct", w: 360 }]) {
    await page.setViewportSize({ width: w.w, height: 900 });
    await page.goto(`${BASE}/positions`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `scratch-audit/final-Positions-${w.l}.png`, fullPage: false });
  }

  // Position board — confirm Re-score all reachable at 400%.
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`${BASE}/positions/BD-01`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const btn = page.getByRole("button", { name: /Re-score all/i });
  const box = await btn.boundingBox();
  console.log("Re-score all boundingBox at 400%:", JSON.stringify(box), "viewport width: 360");
  const visible = box && box.x >= 0 && box.x + box.width <= 360;
  console.log("Re-score all fully within 360px viewport:", visible);
  await page.screenshot({ path: "scratch-audit/final-PositionBoard-400pct.png", fullPage: false });
  // Try actually clicking it to prove it's truly reachable, not just geometrically present.
  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(1000);
  console.log("Clicked Re-score all successfully at 400% viewport.");

  await browser.close();
};

run().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
