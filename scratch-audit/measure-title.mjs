import { chromium } from "playwright";

const BASE = "https://hyre-hiring.pages.dev";
// Realistic candidate title strings: what's actually in the live data, plus a
// couple of longer-but-plausible real-world titles to measure against, not
// just the shortest thing currently seeded.
const CANDIDATES = [
  "Backend Dev",
  "Senior network engineer",
  "Network Engineer",
  "Regional manager",
  "Senior DevOps Engineer",
  "Senior Software Engineer",
  "Site Reliability Engineer",
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

  const results = await page.evaluate((titles) => {
    // Match the exact class list HoverScrollText's inner span uses for the
    // Position-cell title, so font-family/size/weight are identical to prod.
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "nowrap";
    probe.className = "min-w-0 max-w-[45%] shrink font-medium text-foreground";
    const inner = document.createElement("span");
    inner.className = "inline-block";
    probe.appendChild(inner);
    document.body.appendChild(probe);

    const widths = {};
    for (const t of titles) {
      inner.textContent = t;
      widths[t] = Math.ceil(probe.getBoundingClientRect().width);
    }
    document.body.removeChild(probe);
    return widths;
  }, CANDIDATES);

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
