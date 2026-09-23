import { describe, it, expect } from "vitest";
import { scoreApplication } from "./engine.js";
import { requirementEntries, validateGroups } from "./requirements.js";
import { planRequirements } from "../requirement-plan.js";

const embedTexts = async texts => texts.map((_, i) => [0, 0]);
const candidate = skills => ({ skills, extractedText: skills.join(". "), totalYearsExperience: 5, education: [] });
const score = (skills, requirements, requirementPlan) => scoreApplication(candidate(skills), requirements, { embedTexts, requirementPlan });

describe("role coverage scoring", () => {
  it("credits a relevant subset of 50 tools across independent capabilities, not one weak match", async () => {
    const requirements = { requiredSkills: Array.from({ length: 50 }, (_, i) => `Tool${i}`) };
    const entries = requirementEntries(requirements);
    const groups = Array.from({ length: 10 }, (_, i) => ({ label: `Capability${i}`, weight: 2, alternatives: Array.from({ length: 5 }, (_, j) => [i * 5 + j]) }));
    const env = { AI: { run: async () => ({ response: JSON.stringify({ groups }) }) } };
    const plan = await planRequirements(requirements, env);
    expect(plan.entries).toEqual(entries);
    expect((await score(groups.map(g => `Tool${g.alternatives[0][0]}`), requirements, plan)).overallScore).toBeGreaterThanOrEqual(90);
    expect((await score(["Tool0"], requirements, plan)).overallScore).toBeLessThan(45);
  });
  it("credits one complete stack, but not a single fragment", async () => {
    const requirements = { requiredSkills: ["Java + Spring Boot OR Node.js + Express OR Python + Django"] };
    expect((await score(["Python", "Django"], requirements)).breakdown.coreSkills.score).toBe(45);
    expect((await score(["Python"], requirements)).breakdown.coreSkills.score).toBe(22.5);
  });
  it("makes optional skills a bounded bonus", async () => {
    const requirements = { requiredSkills: ["Testing"], niceToHave: ["Reporting", "Planning"] };
    const without = await score(["Testing"], requirements);
    const withBonus = await score(["Testing", "Reporting", "Planning"], requirements);
    expect(without.overallScore).toBeGreaterThanOrEqual(95);
    expect(withBonus.overallScore - without.overallScore).toBeLessThanOrEqual(5);
  });
  it("keeps descriptions as context and respects explicit mandatory alternatives", async () => {
    const requirements = { requiredSkills: ["legacy"], requiredSkillsDisplay: "Skill: Java + Spring Boot OR Node.js OR Python\nDescription: Core server-side technologies used by the company for enterprise microservices and secure business logic.\nMandatory: Testing" };
    const entries = requirementEntries(requirements);
    expect(entries).toHaveLength(2);
    expect(entries[0].alternatives).toEqual([["Java", "Spring Boot"], ["Node.js"], ["Python"]]);
    expect(entries[0].context).toContain("enterprise microservices");
    expect((await score(["Python"], requirements)).eligibility.status).toBe("needs_review");
    expect((await score(["Python", "Testing"], requirements)).eligibility.status).toBe("meets");
  });
  it("rejects omitted, invented or duplicated plan requirements", () => {
    const entries = requirementEntries({ requiredSkills: ["Testing", "Planning"] });
    for (const alternatives of [[[0]], [[0], [2]], [[0], [0]]]) expect(() => validateGroups([{ label: "Work", weight: 2, alternatives }], entries)).toThrow();
  });
  it("batches semantic evidence checks and awards only partial inferred credit", async () => {
    const calls = [];
    const result = await scoreApplication(candidate(["Evidence of a related professional capability"]),
      { requiredSkills: ["Capability A", "Capability B"] }, { embedTexts: async texts => {
        calls.push(texts); return texts.map(() => [1, 0]);
      } });
    expect(calls).toHaveLength(1);
    expect(result.breakdown.coreSkills.score).toBe(22.5);
    expect(result.breakdown.coreSkills.matched.every(r => r.status === "inferred" && r.evidence)).toBe(true);
  });
});
