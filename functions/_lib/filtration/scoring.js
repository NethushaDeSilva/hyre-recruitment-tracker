// WS5/5.3 — the 100-point scoring model. Pure functions only: every number
// here must be reproducible by hand from these formulas (5.3's own bar).
// Nothing in this file calls an LLM or an embedding model — by the time a
// value reaches here, matching.js and verification.js have already decided
// what's matched and how much each match is worth; this file only turns
// those decisions into points.

import { classifyDegree, classifyAwardType } from "./degree.js";

// 5.6: 'verified' earns full credit, 'inferred' earns reduced credit,
// 'unverifiable' earns none. CLAUDE.md names the three tiers but not an
// exact weight for the middle one — 0.5 is this implementation's specific,
// documented choice (half credit for a claim the text doesn't literally
// contain but nearby content plausibly supports), not a value from the spec.
export const INFERRED_CREDIT_WEIGHT = 0.5;

export function creditWeightForStatus(status) {
  if (status === "verified") return 1;
  if (status === "inferred") return INFERRED_CREDIT_WEIGHT;
  return 0; // unverifiable, or no status at all (never reached verification)
}

/** 5.3 — non-linear, so a large experience deficit is penalised harder than
 * a small one. Flat 20 at or above the requirement is deliberate: the
 * vacancy stated a minimum, not a preference. */
export function experienceScore(candidateYrs, requiredYrs) {
  if (requiredYrs === 0) return 20;
  if (candidateYrs >= requiredYrs) return 20;
  return Math.round(20 * Math.pow(candidateYrs / requiredYrs, 1.5));
}

/** Turns a list of per-skill credit weights (1 / INFERRED_CREDIT_WEIGHT / 0,
 * one per required skill) into a score out of `weight` points. Proportion
 * of required skills earned, times the component's point budget. */
export function weightedSkillsScore(creditWeights, requiredCount, weight) {
  if (!requiredCount) return 0;
  const earned = creditWeights.reduce((sum, w) => sum + w, 0);
  return Math.round((earned / requiredCount) * weight);
}

/**
 * Degree LEVEL is the strict structural rule (5.4): does ANY of the
 * candidate's education entries reach the required level, independent of
 * field. Field similarity (when a field is required) is scored separately
 * and does NOT depend on level — a candidate can hold exactly the right
 * field at the wrong level (or vice versa); level-not-met is handled by the
 * overall cap below, not by zeroing the field credit here.
 */
export function classifyCandidateEducation(education) {
  return (education || []).map((e) => {
    // Current WS4 shape: awardType and field extracted as two separate,
    // honest facts (never one squashed string the model could lose a field
    // inside of — see cv-ai.js). "awardType" in e distinguishes this from
    // the legacy shape below, including when field itself is null.
    if (e && typeof e === "object" && "awardType" in e) {
      const { level, recognised } = classifyAwardType(e.awardType);
      return { level, field: e.field ?? null, recognised, source: e.awardType || "" };
    }
    // Legacy shape (candidates parsed before this fix): one combined degree
    // string, split by regex. Existing candidates must keep scoring exactly
    // as before (CLAUDE.md section 2) — this path is unchanged.
    return { ...classifyDegree(e.degree), source: e.degree };
  });
}

export function levelMetFor(classifiedEducation, requiredLevel) {
  return classifiedEducation.some((c) => c.level != null && c.level >= requiredLevel);
}

/**
 * Qualification component (0-25), independent of level. Caller supplies the
 * field-match result (from matching.js's matchTermSet, required field vs
 * every classified degree field) since that module stays separate from this
 * pure one. `requiredQualification.field === null` means there is nothing to
 * compare — full credit is gated on level alone in that case (5.4: "any
 * degree at or above the required level earns full qualification points").
 *
 * No `fieldSimilarity` in the returned object — matching.js's layer 3 (the
 * only thing that ever produced a graded similarity here) was removed
 * 2026-09-12 (5.4). Field matching is now normalisation-or-nothing, same as
 * skills, so there is no similarity score left to report, only matched/not.
 */
export function qualificationScore(requiredQualification, { levelMet, fieldMatch, classifiedEducation }) {
  if (!requiredQualification) return null; // caller should use the null-qualification path instead
  if (!requiredQualification.field) {
    const source = levelMet
      ? classifiedEducation.filter((c) => c.level != null && c.level >= requiredQualification.level).map((c) => c.source)
      : [];
    return { score: levelMet ? 25 : 0, max: 25, levelMet, matched: source };
  }
  const hit = fieldMatch && fieldMatch.matched[0];
  const matched = Boolean(hit);
  // Report the full degree title (e.g. "BSc Computer Science"), not just the
  // bare field text that was actually compared — that's what a human reading
  // the breakdown recognises.
  const sourceEntry = hit ? classifiedEducation.find((c) => c.field === hit.found) : null;
  return {
    score: matched ? 25 : 0,
    max: 25,
    levelMet,
    matched: sourceEntry ? [sourceEntry.source] : [],
  };
}

/**
 * Final aggregation. `qual` is either the qualificationScore() result, or
 * `null` when the vacancy has no requiredQualification at all (5.3's
 * "applicable: false" path — the 25 points have no basis and are never
 * silently deducted; the remaining 75 are rescaled to 100).
 *
 * Degree-level deficit cap is SCALED, never clamped (5.3): a hard
 * Math.min(raw, 40) would flatten every under-levelled candidate to exactly
 * 40 and destroy rank order among them.
 */
export function aggregateScore({ qual, skillsScore, experienceScoreValue, niceToHaveScore, roleCoverage = false }) {
  if (roleCoverage) {
    // No qualification required at all: skills(45)+experience(20) are the
    // ONLY mandatory components (65 max), so they're rescaled up to a
    // 100-point base before adding niceToHaveScore — otherwise nobody could
    // ever clear ~70, even with a perfect match, just because the vacancy
    // has no degree requirement to fill the other 25 points.
    if (!qual) {
      const base = (skillsScore + experienceScoreValue) / 65 * 100;
      return { overallScore: Math.round(Math.min(100, base + niceToHaveScore)), capApplied: false };
    }
    // Qualification required: qual(25)+skills(45)+experience(20) already sum
    // to a 90-point mandatory total on their own scale — a direct sum, NOT a
    // rescale-to-100 first. The previous version rescaled this 90 up to 100
    // before adding niceToHaveScore, so any candidate clearing every
    // mandatory point auto-hit 100 regardless of preferred-skill credit
    // (e.g. 90/90 real points inflated to 100, discarding niceToHaveScore).
    const raw = Math.min(100, qual.score + skillsScore + experienceScoreValue + niceToHaveScore);
    return { overallScore: Math.round(qual.levelMet ? raw : raw * 0.4), capApplied: !qual.levelMet };
  }
  if (!qual) {
    const overallScore = Math.round(((skillsScore + experienceScoreValue + niceToHaveScore) / 75) * 100);
    return { overallScore, capApplied: false };
  }
  const raw = qual.score + skillsScore + experienceScoreValue + niceToHaveScore;
  if (qual.levelMet) {
    return { overallScore: Math.round(raw), capApplied: false };
  }
  return { overallScore: Math.round(40 * (raw / 100)), capApplied: true };
}
