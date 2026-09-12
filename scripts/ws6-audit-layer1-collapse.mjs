// WS6.1 methodology audit — does normalizeTerm() (layer 1) collapse any
// calibration hard-negative pair to the SAME normalized string before layer 3
// ever sees it? If so, that pair's measured similarity is real but
// unreachable in the live engine, and using it to set the threshold that
// governs layer 3 is a methodology error — the threshold would be pinned by
// a case layer 3 never actually evaluates.
import { readFileSync } from "node:fs";
import { normalizeTerm } from "../functions/_lib/filtration/matching.js";

const data = JSON.parse(readFileSync("test-fixtures/calibration-pairs/calibration-thresholds.json", "utf8"));

function audit(label, pairs, threshold) {
  console.log(`\n=== ${label} (committed threshold: ${threshold}) ===`);
  const hardNegs = pairs.filter((p) => p.category === "hard_negative");
  const collapsed = [];
  const reachable = [];
  for (const p of hardNegs) {
    const na = normalizeTerm(p.a);
    const nb = normalizeTerm(p.b);
    const collides = na === nb;
    console.log(`${collides ? "COLLAPSED " : "reachable "} "${p.a}" (-> "${na}")  /  "${p.b}" (-> "${nb}")  sim=${p.similarity.toFixed(4)}`);
    (collides ? collapsed : reachable).push(p);
  }
  const trueMatches = pairs.filter((p) => p.category === "true_match");
  const maxTrueMatch = Math.max(...trueMatches.map((p) => p.similarity));
  const correctedMax = Math.max(...reachable.map((p) => p.similarity));
  const bindingPair = reachable.find((p) => p.similarity === correctedMax);
  console.log(`\nCollapsed (layer-1-unreachable) hard negatives: ${collapsed.length}/${hardNegs.length}`);
  collapsed.forEach((p) => console.log(`  - "${p.a}"/"${p.b}" (sim=${p.similarity.toFixed(4)}) -- excluded`));
  console.log(`Original threshold (max over all ${hardNegs.length} hard negatives): ${threshold}`);
  console.log(`Corrected threshold (max over ${reachable.length} layer-3-REACHABLE hard negatives): ${correctedMax.toFixed(4)}`);
  console.log(`Corrected threshold set by: "${bindingPair.a}" / "${bindingPair.b}"`);
  console.log(`Delta: ${(threshold - correctedMax).toFixed(4)} (threshold moves ${threshold > correctedMax ? "DOWN" : "UP"})`);
  console.log(`True-match max similarity: ${maxTrueMatch.toFixed(4)} -- still ${maxTrueMatch > correctedMax ? "ABOVE (clears)" : "below (false negative)"} the corrected threshold`);
  const stillFalseNeg = trueMatches.filter((p) => p.similarity <= correctedMax).length;
  console.log(`False-negative rate at corrected threshold: ${stillFalseNeg}/${trueMatches.length} (${(100 * stillFalseNeg / trueMatches.length).toFixed(1)}%)`);
  return { collapsed, correctedMax, bindingPair };
}

const skillsResult = audit("SKILLS (SKILL_SIMILARITY_THRESHOLD)", data.skills.pairs, data.skillThreshold);
const qualResult = audit("QUALIFICATIONS (QUAL_SIMILARITY_THRESHOLD)", data.qualifications.pairs, data.qualThreshold);
