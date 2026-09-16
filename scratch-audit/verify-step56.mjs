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

  for (const w of [1440, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/candidates`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `scratch-audit/verify56-Candidates-${w}.png`, fullPage: false });
  }

  // Hover a truncated qualification cell to prove the reveal still works
  // (step 6 must not have broken the existing mechanism).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/candidates`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const qualCell = page.locator("tbody tr").first().locator("td").nth(4);
  await qualCell.hover();
  await page.waitForTimeout(900); // let the slide animation play
  await page.screenshot({ path: "scratch-audit/verify56-hover-reveal.png", fullPage: false });

  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
