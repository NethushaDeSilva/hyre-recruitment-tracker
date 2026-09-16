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
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const table = document.querySelector("table.text-sm");
    function measure(innerHTML, tdClass) {
      const td = document.createElement("td");
      td.className = tdClass;
      td.style.position = "absolute";
      td.style.visibility = "hidden";
      td.style.whiteSpace = "nowrap";
      td.innerHTML = innerHTML;
      table.appendChild(td);
      const w = Math.ceil(td.getBoundingClientRect().width);
      table.removeChild(td);
      return w;
    }
    // Candidate ID: font-mono text-xs font-semibold, format CAND-#### (fixed width digits)
    const candIdW = measure('<span class="font-mono text-xs font-semibold">CAND-0083</span>', "px-4 py-3 align-top");
    // Applied date: whatever formatDate() actually renders live right now for a real appliedAt.
    const appliedCell = [...document.querySelectorAll("tbody td")].find(td => /\d{1,2} \w{3,4} \d{4}/.test(td.textContent));
    const appliedText = appliedCell?.textContent?.trim();
    const appliedW = appliedText ? measure(appliedText, "px-4 py-3 align-top text-muted-foreground") : null;

    return { candIdW, appliedText, appliedW };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
