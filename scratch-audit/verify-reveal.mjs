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
  await page.goto(`${BASE}/candidates`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const emailEl = page.locator("text=desilvanethusha+priya").first();
  await page.screenshot({ path: "scratch-audit/reveal-1-before-hover.png", clip: { x: 260, y: 340, width: 260, height: 60 } });

  const before = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".group\\/hst")].find(e => e.textContent.includes("desilvanethusha+priya"));
    const ell = el?.querySelector('[aria-hidden="true"]');
    return { opacity: ell ? getComputedStyle(ell).opacity : null };
  });
  console.log("Ellipsis opacity before hover:", before.opacity);

  await emailEl.hover();
  await page.waitForTimeout(700); // let slide animation run
  await page.screenshot({ path: "scratch-audit/reveal-2-during-hover.png", clip: { x: 260, y: 340, width: 260, height: 60 } });

  const during = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".group\\/hst")].find(e => e.textContent.includes("desilvanethusha+priya"));
    const ell = el?.querySelector('[aria-hidden="true"]');
    const inner = el?.querySelector("span");
    return {
      opacity: ell ? getComputedStyle(ell).opacity : null,
      transform: inner ? getComputedStyle(inner).transform : null,
    };
  });
  console.log("Ellipsis opacity during hover:", during.opacity, "| inner transform:", during.transform);

  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
