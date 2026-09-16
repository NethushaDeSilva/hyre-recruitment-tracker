import { chromium } from "playwright";
const BASE = "https://hyre-hiring.pages.dev";
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').fill("hr@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/candidates`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  console.log("URL:", page.url(), "| td count:", await page.locator("td").count());

  const info = await page.evaluate(() => {
    const all = [...document.querySelectorAll("td")].map(td => td.textContent.slice(0, 40));
    const emailEl = [...document.querySelectorAll("td")].find(td => td.textContent.includes("desilvanethusha"));
    if (!emailEl) return { found: false, sampleCells: all.slice(0, 10) };
    const candidates = [...emailEl.querySelectorAll(".relative.overflow-hidden")];
    const hst = candidates.find(el => el.textContent.includes("desilvanethusha"));
    const ellipsisSpan = hst?.querySelector('[aria-hidden="true"]');
    return {
      found: true,
      matchCount: candidates.length,
      hstClass: hst?.className,
      hstClientWidth: hst?.clientWidth,
      innerScrollWidth: hst?.querySelector("span")?.scrollWidth,
      hasEllipsisSpan: !!ellipsisSpan,
      ellipsisText: ellipsisSpan?.textContent,
      ellipsisVisible: ellipsisSpan ? getComputedStyle(ellipsisSpan).opacity : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
