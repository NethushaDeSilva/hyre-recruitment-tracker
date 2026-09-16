import { chromium } from "playwright";

const BASE = "https://hyre-hiring.pages.dev";
const WIDTHS = [
  { label: "100pct", width: 1440, height: 900 },
  { label: "400pct", width: 360, height: 900 },
  { label: "mobile", width: 375, height: 800 },
];

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.locator('input[type="email"]').fill("hr@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2500);

  // --- CandidateDetailModal (from Candidates page, click a row) ---
  await page.goto(`${BASE}/candidates`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.locator("tbody tr").first().locator("td").nth(1).click();
  await page.waitForTimeout(1000);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `scratch-audit/modal-CandidateDetail-${w.label}.png` });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // --- OpenPositionModal (from Positions page, "Open position") ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/positions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Open position/i }).click();
  await page.waitForTimeout(1000);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `scratch-audit/modal-OpenPosition-${w.label}.png` });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // --- ApplyModal (candidate side) ---
  await page.setViewportSize({ width: 1440, height: 900 });
  const cand = await browser.newPage();
  await cand.setViewportSize({ width: 1440, height: 900 });
  await cand.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await cand.waitForTimeout(1000);
  await cand.locator('input[type="email"]').fill("desilvanethusha+priya@gmail.com");
  await cand.locator('input[type="password"]').fill("HyreSeed2026!");
  await cand.getByRole("button", { name: /^Sign in$/i }).click();
  await cand.waitForTimeout(2500);
  await cand.goto(`${BASE}/jobs`, { waitUntil: "domcontentloaded" });
  await cand.waitForTimeout(1500);
  await cand.getByRole("button", { name: /Apply/i }).first().click();
  await cand.waitForTimeout(1000);
  for (const w of WIDTHS) {
    await cand.setViewportSize({ width: w.width, height: w.height });
    await cand.waitForTimeout(400);
    await cand.screenshot({ path: `scratch-audit/modal-Apply-${w.label}.png` });
  }

  await browser.close();
  console.log("done");
};

run().catch((e) => { console.error(e); process.exit(1); });
