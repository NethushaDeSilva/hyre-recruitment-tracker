import { chromium } from "playwright";

const BASE = "https://hyre-hiring.pages.dev";

const QUALIFICATIONS = [
  "GCE O/L", "GCE A/L", "Diploma", "Higher Diploma", "Bachelor's Degree",
  "Postgraduate Diploma", "Master's Degree", "PhD", "Professional Certification",
];
const EXPERIENCE_RANGES = [
  "No experience", "Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years",
];

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

  const result = await page.evaluate(({ QUALIFICATIONS, EXPERIENCE_RANGES }) => {
    // Match the EXACT live <td> class chain for each column (table text-sm,
    // td px-4 py-3 align-top text-muted-foreground) so measurements are
    // real, not approximated by guessing a font-size.
    const table = document.querySelector("table.text-sm");
    function measureInCell(text) {
      const td = document.createElement("td");
      td.className = "px-4 py-3 align-top text-muted-foreground";
      td.style.position = "absolute";
      td.style.visibility = "hidden";
      td.style.width = "auto";
      td.style.whiteSpace = "nowrap";
      td.textContent = text;
      table.appendChild(td);
      const w = Math.ceil(td.getBoundingClientRect().width);
      table.removeChild(td);
      return w;
    }
    const qual = {};
    for (const q of QUALIFICATIONS) qual[q] = measureInCell(q);
    const exp = {};
    for (const e of EXPERIENCE_RANGES) exp[e] = measureInCell(e);

    // Also grab current colgroup widths and current table width, and the
    // viewport/available content width the table lives in, for the
    // "does it still fit at 100%" check.
    const cols = [...document.querySelectorAll("colgroup col")].map(c => c.className);
    const wrapper = document.querySelector(".overflow-x-auto");
    return {
      qualificationWidths: qual,
      experienceWidths: exp,
      currentColWidths: cols,
      wrapperClientWidth: wrapper?.clientWidth,
      tableScrollWidth: wrapper?.querySelector("table")?.scrollWidth,
      currentTableMinWidth: getComputedStyle(wrapper.querySelector("table")).minWidth,
    };
  }, { QUALIFICATIONS, EXPERIENCE_RANGES });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
