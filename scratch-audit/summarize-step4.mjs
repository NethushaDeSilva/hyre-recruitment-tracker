import { readFileSync } from "fs";

const results = JSON.parse(readFileSync("scratch-audit/results-step4.json", "utf8"));

// Group by page -> signature (tag + normalized class pattern + failure type)
const byPage = new Map();
for (const r of results) {
  if (!r.offenders?.length) continue;
  if (!byPage.has(r.page)) byPage.set(r.page, new Map());
  const sigMap = byPage.get(r.page);
  for (const o of r.offenders) {
    // Normalize class: strip Tailwind arbitrary/dynamic bits for grouping, keep semantic tokens.
    const normCls = o.cls
      .split(/\s+/)
      .filter((c) => !/^(px|py|pt|pb|pl|pr|mt|mb|ml|mr|w|h|min-w|max-w|gap|text-\[|top-|left-|right-|bottom-)/.test(c) || /rounded-full|rounded-md|shrink|wrap|min-w-0|flex-wrap/.test(c))
      .join(" ");
    const type = o.wrapped ? "WRAPPED-TEXT" : o.overflowsViewport ? "OVERFLOWS-VIEWPORT" : "OVERFLOWS-PARENT";
    const sig = `${type} | ${o.tag} | ${normCls.slice(0, 90)}`;
    if (!sigMap.has(sig)) sigMap.set(sig, { count: 0, zooms: new Set(), example: o.text, fullCls: o.cls });
    const entry = sigMap.get(sig);
    entry.count++;
    entry.zooms.add(r.zoom);
  }
}

for (const [page, sigMap] of byPage) {
  console.log(`\n\n========== ${page} ==========`);
  const sorted = [...sigMap.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [sig, info] of sorted.slice(0, 15)) {
    console.log(`  [${info.count}x @ ${[...info.zooms].join(",")}] ${sig}`);
    console.log(`      text: "${info.example}"`);
    console.log(`      class: ${info.fullCls}`);
  }
}
