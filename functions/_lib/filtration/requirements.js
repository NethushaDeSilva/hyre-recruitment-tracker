// Source-preserving parsing shared by AI planning and candidate skill labels.
//
// A whole line consisting ONLY of known section-label vocabulary (optionally
// combined with "/", "&" or "," — e.g. "Nice-to-Haves / Edge Factors") is a
// heading, never a skill, even when it doesn't end in the literal word
// "skills"/"requirements" the older, narrower check demanded.
const HEADING_PHRASE = "(?:nice[- ]?to[- ]?have(?:s)?|good[- ]?to[- ]?have(?:s)?|must[- ]?have(?:s)?|edge factors?|core skills?|primary skills?|secondary skills?|preferred skills?|desirable skills?|essential skills?|key skills?|technical skills?|bonus (?:skills?|points?)|skills?|competenc(?:y|ies)|requirements?|qualifications?)";
const HEADING_LINE_RE = new RegExp(`^${HEADING_PHRASE}(?:\\s*[/&,]\\s*${HEADING_PHRASE})*\\s*:?$`, "i");

// A fragment that starts with a bare LOWERCASE conjunction ("and turtle
// necks", not "And now for something completely different") is a leftover
// piece of a longer sentence that got severed by a comma-split or a hard
// line-wrap in pasted text — never a skill name in its own right.
function stripLeadingConjunction(text) {
  const m = /^(?:and|or|but|with)\s+(.*)$/.exec(text);
  return m ? m[1] : null;
}
// Once the conjunction is stripped, decide whether what's left reads like a
// genuine standalone tool/skill name ("AWS Config" — short, no parenthetical
// aside, no internal punctuation) or leftover connective/contextual prose
// with no independent meaning ("AI product integrations (such as ...)").
function isWellFormedFragment(text) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && !text.includes("(") && !/[,;]/.test(text);
}

function splitNames(text) {
  let depth = 0;
  return text.replace(/[()[\],;]/g, char => {
    if (char === "(" || char === "[") depth++;
    if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    return (char === "," || char === ";") && !depth ? "\n" : char;
  }).split("\n");
}
export function requirementEntries(requirements, preferred = false) {
  const display = requirements[preferred ? "niceToHaveDisplay" : "requiredSkillsDisplay"];
  const extraction = requirements.skillExtraction;
  const key = preferred ? "nice" : "required";
  const extracted = extraction?.version === 1 && extraction[key + "Source"] === display ? extraction[key] : null;
  const source = extracted ?? (display?.trim() || (requirements[preferred ? "niceToHave" : "requiredSkills"] || []).join("\n"));
  const entries = [];
  let heading = "";
  for (let line of source.split(/\r?\n/)) {
    line = line.trim().replace(/\*\*|__/g, "");
    line = line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "");
    if (HEADING_LINE_RE.test(line) || /^(?:[\w /&-]+\s+)?(?:skills|competencies|requirements)\s*:?$/i.test(line)) { heading = line.replace(/:$/, ""); continue; }
    if (/^description\s*:/i.test(line)) {
      if (entries.length) entries.at(-1).context += " " + line.replace(/^description\s*:/i, "").trim();
      continue;
    }
    if (/^#{1,6}\s/.test(line) || /:$/.test(line)) { heading = line.replace(/^#+\s*/, "").replace(/:$/, ""); continue; }
    line = line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "").replace(/^(?:(?:required|core|technical|nice[- ]to[- ]have|preferred)\s+)?skills?\s*:\s*/i, "");
    line = line.replace(/^(?:frameworks|languages|programming languages|tools|libraries)\s*:\s*/i, "");
    if (!line) continue;
    line = line.replace(/^(mandatory|essential|must have)(?:\s+skills?)?\s*:\s*/i, "$1 ");
    const [names, ...description] = line.split(/\s+[—–-]\s+|\s*:\s+/);
    for (let name of splitNames(names).map(s => s.trim()).filter(Boolean)) {
      // A fragment severed from a longer sentence by a comma-split or a
      // pasted line-wrap ("...LLM pipelines,\nand AI product integrations
      // (such as ...)." / "Checkov, Tfsec, or AWS Config."). Never left as
      // its own chip starting with a bare conjunction: a short, clean
      // remainder ("AWS Config") becomes its own entry with the conjunction
      // dropped; a longer contextual remainder with no independent meaning
      // is folded into the previous entry's context instead, invisible in
      // the candidate-facing chip list.
      const stripped = stripLeadingConjunction(name);
      if (stripped !== null) {
        const remainder = stripped.replace(/[.,;]+$/, "").trim();
        if (isWellFormedFragment(remainder)) {
          name = remainder;
        } else {
          if (entries.length) entries.at(-1).context = (entries.at(-1).context + " " + remainder).trim();
          continue;
        }
      }
      const mandatory = !preferred && /\b(must(?: have)?|mandatory|essential|non-negotiable)\b/i.test(name + " " + heading);
      const cleaned = name.replace(/\b(must(?: have)?|mandatory|essential|non-negotiable)\b\s*:?/gi, "").trim();
      const alternatives = cleaned.split(/\s+OR\s+|\s*\|\s*/i).map(branch => branch.split(/\s+\+\s+|\s+AND\s+|\s*&\s*/i).map(s => s.trim()).filter(Boolean)).filter(a => a.length);
      if (alternatives.length && !entries.some(e => e.name.toLowerCase() === cleaned.toLowerCase())) entries.push({ id: entries.length, name: cleaned, heading, context: description.join(" — "), mandatory, alternatives });
    }
  }
  if (extracted) {
    const original = requirementEntries({ ...requirements, skillExtraction: null }, preferred);
    for (const entry of entries) {
      const sourceEntry = original.find(item => item.name.toLowerCase().includes(entry.name.toLowerCase()));
      if (sourceEntry) { entry.context ||= sourceEntry.context; entry.mandatory ||= sourceEntry.mandatory; }
    }
  }
  return entries;
}

export function defaultGroups(entries) {
  return entries.map(e => ({ label: e.name, weight: 1, alternatives: [[e.id]] }));
}

export function validateGroups(groups, entries) {
  const seen = new Set();
  if (!Array.isArray(groups) || !groups.length) throw new Error("Requirement analysis returned no capabilities.");
  for (const group of groups) {
    if (typeof group.label !== "string" || !group.label.trim() || !Number.isInteger(group.weight) || group.weight < 1 || group.weight > 3 || !Array.isArray(group.alternatives) || !group.alternatives.length) throw new Error("Invalid requirement capability.");
    for (const branch of group.alternatives) {
      if (!Array.isArray(branch) || !branch.length) throw new Error("Empty requirement alternative.");
      for (const id of branch) {
        if (!Number.isInteger(id) || !entries[id] || seen.has(id)) throw new Error("Requirement analysis duplicated or invented a requirement.");
        seen.add(id);
      }
    }
  }
  if (seen.size !== entries.length) throw new Error("Requirement analysis omitted requirements.");
  return groups;
}

export function coverage(groups, entries, credits) {
  const entryCredit = e => Math.max(...e.alternatives.map(branch => branch.reduce((sum, term) => sum + (credits.get(term) || 0), 0) / branch.length));
  return groups.map(g => ({ ...g, coverage: Math.max(...g.alternatives.map(branch => branch.reduce((sum, id) => sum + entryCredit(entries[id]), 0) / branch.length)) }));
}
