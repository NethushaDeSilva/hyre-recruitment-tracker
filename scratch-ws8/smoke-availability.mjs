import { chromium } from "playwright";
const BASE = "http://localhost:5173";
const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').fill("interviewer@hyre.app");
  await page.locator('input[type="password"]').fill("hyre1234");
  await page.getByRole("button", { name: /^Sign in$/i }).click();
  await page.waitForTimeout(2000);

  // nav item present?
  const navLink = page.locator('a[href="/availability"]');
  const navVisible = await navLink.count();
  console.log("Nav link count:", navVisible);

  await page.goto(`${BASE}/availability`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  console.log("URL after nav:", page.url());
  await page.screenshot({ path: "scratch-ws8/availability-1-initial.png", fullPage: true });

  // toggle "Junior" level
  await page.getByRole("button", { name: "Junior" }).click();
  // add a recurring window
  await page.getByRole("button", { name: /Add window/i }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "scratch-ws8/availability-2-editing.png", fullPage: true });

  // save
  await page.getByRole("button", { name: /Save availability/i }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "scratch-ws8/availability-3-saved.png", fullPage: true });

  // reload and confirm persistence
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const juniorSelected = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => x.textContent.trim().includes("Junior"));
    return b ? b.className.includes("bg-primary") : null;
  });
  const slotCount = await page.locator("input[type=time]").count();
  console.log("Junior selected after reload:", juniorSelected, "| time-input count:", slotCount / 2);
  await page.screenshot({ path: "scratch-ws8/availability-4-reloaded.png", fullPage: true });

  console.log("Console/page errors:", errors.length ? errors : "none");
  await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });
