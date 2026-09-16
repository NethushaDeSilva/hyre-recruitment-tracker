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
  await page.goto(`${BASE}/employees`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  for (const w of [1440, 400]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const wrapper = document.querySelector(".overflow-x-auto");
      const table = wrapper?.querySelector("table");
      const emailDivs = [...document.querySelectorAll("td div.truncate")].filter(d => d.textContent.includes("@"));
      return {
        wrapperClientWidth: wrapper?.clientWidth,
        wrapperScrollWidth: wrapper?.scrollWidth,
        tableWidth: table?.getBoundingClientRect().width,
        emails: emailDivs.map(d => ({
          text: d.textContent,
          clientWidth: d.clientWidth,
          scrollWidth: d.scrollWidth,
          clipped: d.scrollWidth > d.clientWidth + 1,
          computedTextOverflow: getComputedStyle(d).textOverflow,
        })),
      };
    });
    console.log(`--- viewport ${w}px ---`);
    console.log(JSON.stringify(info, null, 2));
  }
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
