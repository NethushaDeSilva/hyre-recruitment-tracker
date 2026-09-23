import { requirementEntries } from "../../functions/_lib/filtration/requirements.js";

// Keep full prose in the Display fields; arrays contain only skill labels.
export function parseSkills(text = "") {
  return requirementEntries({ requiredSkillsDisplay: text }).map(entry => entry.name);
}
export function publicSkillLabels(requirements, preferred = false) {
  return requirementEntries(requirements, preferred).map(entry => entry.name);
}
export const organizeSkills = text => parseSkills(text).map(skill => `\u2022 ${skill}`).join("\n");
