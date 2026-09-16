import { chromium } from "playwright";
const BASE = "https://hyre-hiring.pages.dev";
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').fill("interviewer@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/availability`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "scratch-ws8/prod-availability.png", fullPage: true });
  console.log("done, url:", page.url());
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
