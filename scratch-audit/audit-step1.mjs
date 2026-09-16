import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE = "https://hyre-hiring.pages.dev";

// "Zoom" simulated per WCAG 1.4.10's own definition: 400% zoom on a 1280px
// window ~= content must reflow at an effective 320px-wide viewport. We hold
// height generous and shrink width by the zoom factor so we isolate
// horizontal reflow behaviour, which is what 1.4.10 is actually about.
const ZOOM_WIDTHS = [
  { label: "100%", width: 1440, height: 900 },
  { label: "150%", width: 960, height: 900 },
  { label: "200%", width: 720, height: 900 },
  { label: "400%", width: 360, height: 900 },
];
// Separate genuinely-narrow real-viewport widths (not zoom-simulated).
const NARROW_WIDTHS = [
  { label: "tablet-768", width: 768, height: 900 },
  { label: "mobile-375", width: 375, height: 800 },
];

const DETECT = () => {
  const vw = document.documentElement.clientWidth;
  const bodyScrollWidth = document.documentElement.scrollWidth;
  const bodyOverflow = bodyScrollWidth > vw + 2;

  // A container is a LEGITIMATE horizontal-scroll zone (per the "wide content
  // may scroll inside its own container" rule) only if it actually scrolls
  // AND its content genuinely exceeds it. Elements inside one are exempt from
  // viewport/parent overflow checks — that's the container's job, not a bug.
  function hasScrollableAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 2) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // Real text-wrap detection: does the actual text node render across more
  // than one line box? (height-based heuristics false-positive on any
  // padded icon+text button, which is naturally taller than bare text.)
  function textWraps(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim().length > 0) {
        const range = document.createRange();
        range.selectNodeContents(child);
        const rects = range.getClientRects();
        if (rects.length > 1) return true;
      }
    }
    return false;
  }

  const offenders = [];
  const seenRects = new Set();
  const nodes = document.querySelectorAll("span, button, a, td, p, div[class*='rounded-full']");
  for (const el of nodes) {
    const cls = typeof el.className === "string" ? el.className : (el.className?.baseVal || "");
    const text = (el.textContent || "").trim();
    if (!text && !cls.includes("rounded-full")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const parentRect = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    const parentScrolls = parentStyle.overflowX === "auto" || parentStyle.overflowX === "scroll";
    const scrollExempt = hasScrollableAncestor(el);

    const overflowsViewport = !scrollExempt && rect.right > vw + 2;
    const overflowsParent = !scrollExempt && !parentScrolls && rect.right > parentRect.right + 2 && rect.width > 4 && rect.width < 900;
    const wrapped = textWraps(el);

    if (overflowsViewport || overflowsParent || wrapped) {
      const key = `${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}:${text.slice(0, 30)}`;
      if (seenRects.has(key)) continue;
      seenRects.add(key);
      offenders.push({
        tag: el.tagName,
        cls: cls.slice(0, 140),
        text: text.slice(0, 60),
        rectRight: Math.round(rect.right),
        parentRight: Math.round(parentRect.right),
        vw,
        overflowsViewport,
        overflowsParent,
        wrapped,
        height: Math.round(rect.height),
      });
    }
  }
  return { vw, bodyScrollWidth, bodyOverflow, offenderCount: offenders.length, offenders: offenders.slice(0, 30) };
};

async function auditPage(page, name, url, widths, resultsBag, screenshotPrefix) {
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  for (const w of widths) {
    await page.setViewportSize({ width: w.width, height: w.height });
    await page.waitForTimeout(500);
    const result = await page.evaluate(DETECT);
    resultsBag.push({ page: name, url, zoom: w.label, width: w.width, ...result });
    if (result.bodyOverflow || result.offenderCount > 0) {
      await page.screenshot({
        path: `scratch-audit/${screenshotPrefix}-${name.replace(/[^a-z0-9]/gi, "_")}-${w.label}.png`,
        fullPage: false,
      });
    }
  }
}

const run = async () => {
  const browser = await chromium.launch();
  const results = [];

  // ---- staff session ----
  const staff = await browser.newPage();
  staff.on("console", (msg) => { if (msg.type() === "error") console.log("[staff] PAGE ERROR:", msg.text()); });
  await staff.setViewportSize({ width: 1440, height: 900 });
  await staff.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await staff.waitForTimeout(1000);
  await staff.locator('input[type="email"]').fill("hr@hyre.app");
  await staff.locator('input[type="password"]').fill("hyre1234");
  await staff.getByRole("button", { name: /^Sign in$/i }).click();
  await staff.waitForTimeout(2500);
  console.log("Staff signed in, URL:", staff.url());

  const staffPages = [
    ["Positions", "/positions"],
    ["PositionBoard-BD01", "/positions/BD-01"],
    ["Candidates", "/candidates"],
    ["Employees", "/employees"],
  ];
  for (const [name, url] of staffPages) {
    console.log("Auditing (staff):", name);
    await auditPage(staff, name, url, [...ZOOM_WIDTHS, ...NARROW_WIDTHS], results, "step1-staff");
  }

  await staff.close();

  // ---- candidate session ----
  const cand = await browser.newPage();
  cand.on("console", (msg) => { if (msg.type() === "error") console.log("[candidate] PAGE ERROR:", msg.text()); });
  await cand.setViewportSize({ width: 1440, height: 900 });
  await cand.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await cand.waitForTimeout(1000);
  await cand.locator('input[type="email"]').fill("desilvanethusha+priya@gmail.com");
  await cand.locator('input[type="password"]').fill("HyreSeed2026!");
  await cand.getByRole("button", { name: /^Sign in$/i }).click();
  await cand.waitForTimeout(2500);
  console.log("Candidate signed in, URL:", cand.url());

  await cand.close();
  await browser.close();

  writeFileSync("scratch-audit/results-step1.json", JSON.stringify(results, null, 2));

  // ---- console summary ----
  console.log("\n\n========== SUMMARY ==========");
  for (const r of results) {
    const flags = [];
    if (r.bodyOverflow) flags.push(`BODY OVERFLOW (scrollWidth ${r.bodyScrollWidth} > vw ${r.vw})`);
    if (r.offenderCount > 0) flags.push(`${r.offenderCount} element offender(s)`);
    if (flags.length) {
      console.log(`${r.page} @ ${r.zoom} (${r.width}px): ${flags.join(" | ")}`);
    }
  }
};

run().catch((e) => { console.error(e); process.exit(1); });
