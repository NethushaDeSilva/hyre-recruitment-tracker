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
    function measure(text, tdClass) {
      const td = document.createElement("td");
      td.className = tdClass;
      td.style.position = "absolute";
      td.style.visibility = "hidden";
      td.style.whiteSpace = "nowrap";
      td.innerHTML = `<div class="py-1.5 leading-none">${text}</div>`;
      table.appendChild(td);
      const w = Math.ceil(td.getBoundingClientRect().width);
      table.removeChild(td);
      return w;
    }
    // Longest realistic month abbreviation in en-GB short format is "Sept".
    const appliedW = measure("16 Sept 2026", "px-4 py-3 align-top text-muted-foreground");

    // Candidate column: avatar(34) + gap-2.5(10) + name/email stack. Measure
    // the widest live name/email pair actually in the table right now.
    const rows = [...document.querySelectorAll("tbody tr")];
    let widestCandidate = 0, widestCandidateText = "";
    for (const row of rows) {
      const nameEl = row.querySelector('[class*="HoverScrollText"], .truncate, [class*="font-semibold"]');
      // Simpler: read the visible name/email text directly from the second td.
      const td = row.children[1];
      if (!td) continue;
      const nameSpan = td.querySelector(".text-sm.font-semibold, [class*='font-semibold']");
      const emailSpan = td.querySelector(".text-xs.text-muted-foreground, [class*='text-muted-foreground']");
      const nameText = nameSpan?.textContent || "";
      const emailText = emailSpan?.textContent || "";
      const w1 = measure(nameText, "px-4 py-3 align-top");
      const w2 = measure(emailText, "px-4 py-3 align-top text-xs");
      const w = Math.max(w1, w2) + 34 + 10; // + avatar + gap
      if (w > widestCandidate) { widestCandidate = w; widestCandidateText = nameText + " / " + emailText; }
    }

    return { appliedW, widestCandidate, widestCandidateText };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
