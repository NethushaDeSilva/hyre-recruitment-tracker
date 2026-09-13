// WS5 — the initial filtration engine. Orchestrates matching.js (who
// matches — layer 1, normalisation only, since 2026-09-12: see 5.4),
// verification.js (is it grounded in the CV text — 5.6, still
// embedding-backed and deliberately kept), and scoring.js (how many points —
// 5.3) into the 5.7 output schema for one application, plus the
// verification-firing-rate and BORDERLINE instrumentation the 5.4 decision
// record (test-fixtures/ws6-results.md) was built on.
//
// Nothing here calls an LLM. verifyTerm()'s embedding call is the one model
// call left in the scoring path, and 5.1 explicitly allows that — it's the
// generative judgement model that's banned at scoring time, not the
// embedding model 5.6 depends on.

import { matchTermSet } from "./matching.js";
import { verifyTerm, verifyTerms } from "./verification.js";
import {
  classifyCandidateEducation,
  levelMetFor,
  qualificationScore,
  experienceScore,
  weightedSkillsScore,
  aggregateScore,
  creditWeightForStatus,
} from "./scoring.js";
import { getThresholds } from "./thresholds.js";

// The version identifier stamped into meta.engineVersion — by the CALLER, not
// here (see the note on scoreApplication's return below). Exported so
// filtration-ai.js and the client's staleness check both read the same
// literal rather than each hand-typing a copy that could drift apart.
export const ENGINE_VERSION = "1.0.0";

export class ScoringError extends Error {}

// 5.4 instrumentation, relabeled 2026-09-12 to track verifyTerm()'s (5.6)
// firing rate — the embedding-backed layer that's actually still live —
// rather than leaving permanently-zero counters for matching.js's removed
// layer 3. `literal` = resolved by word-boundary text search, no model call.
// `embedding` = verifyTerm() actually called embedTexts. `borderline` = of
// those, how many landed within BORDERLINE_BAND of the threshold — the ones
// exposed to the embedding non-reproducibility measured in 6.4.
function emptyVerificationTally() {
  return { literal: 0, embedding: 0, borderline: 0 };
}
function tallyVerification(results) {
  return results.reduce((acc, v) => {
    if (v.firedEmbedding) acc.embedding++;
    else acc.literal++;
    if (v.borderline) acc.borderline++;
    return acc;
  }, emptyVerificationTally());
}

/** Match a required-skill list against the candidate's skills (layer 1
 * only), verify each match against the stored extracted text, and return
 * both the scored component and the raw matched/missing records for the 5.7
 * breakdown, plus the raw verifyTerm() results for instrumentation. */
async function scoreSkillList(requiredList, candidateSkills, extractedText, weight, deps) {
  const { embedTexts, threshold } = deps;
  const { matched, missing } = matchTermSet(requiredList, candidateSkills);
  const verified = await verifyTerms(matched.map((m) => m.found), extractedText, { embedTexts, threshold });

  const records = matched.map((m, i) => ({
    required: m.required,
    found: m.found,
    status: verified[i].status,
    evidence: verified[i].evidence,
    offset: verified[i].offset,
  }));
  const creditWeights = records.map((r) => creditWeightForStatus(r.status));
  const score = weightedSkillsScore(creditWeights, requiredList.length, weight);

  return { score, max: weight, matched: records, missing, verification: verified };
}

/**
 * Score one application. Throws ScoringError (never a fabricated score) if
 * the vacancy has no structured requirements to score against — 10.1's
 * "block scoring with a clear message" rule.
 *
 * Returns overallScore/capApplied/breakdown/instrumentation only — no
 * `meta`. Provenance (model IDs, thresholds, engineVersion, scoredAt) is
 * assembled by the CALLER (filtration-ai.js) after this returns, never in
 * here: this function has no clock and no knowledge of which embedding model
 * `embedTexts` happens to be backed by, which is what "pure" means for it.
 *
 * @param {object} candidate - CandidateProfile (WS4 schema): skills[],
 *   education[], totalYearsExperience, extractedText
 * @param {object} requirements - vacancy requirements (5.2)
 * @param {{ embedTexts: Function }} deps
 */
export async function scoreApplication(candidate, requirements, deps) {
  if (!requirements || !Array.isArray(requirements.requiredSkills) || !requirements.requiredSkills.length) {
    throw new ScoringError("Vacancy has no structured requirements to score against.");
  }
  const { embedTexts } = deps;
  const { SKILL_SIMILARITY_THRESHOLD, QUAL_SIMILARITY_THRESHOLD } = getThresholds();

  const candidateSkills = candidate.skills || [];
  const extractedText = candidate.extractedText || "";

  const core = await scoreSkillList(requirements.requiredSkills, candidateSkills, extractedText, 45, {
    embedTexts, threshold: SKILL_SIMILARITY_THRESHOLD,
  });
  const niceToHave = requirements.niceToHave || [];
  const preferred = niceToHave.length
    ? await scoreSkillList(niceToHave, candidateSkills, extractedText, 10, { embedTexts, threshold: SKILL_SIMILARITY_THRESHOLD })
    : { score: 0, max: 10, matched: [], missing: [], verification: [] };

  const experience = {
    score: experienceScore(candidate.totalYearsExperience || 0, requirements.minYearsExperience || 0),
    max: 20,
    candidateYears: candidate.totalYearsExperience || 0,
    requiredYears: requirements.minYearsExperience || 0,
  };

  let qual = null;
  let qualVerification = null; // the verifyTerm() result for the matched claim, if any — folded into instrumentation below
  let qualBreakdown = { applicable: false };
  if (requirements.requiredQualification) {
    const classified = classifyCandidateEducation(candidate.education);
    const levelMet = levelMetFor(classified, requirements.requiredQualification.level);
    let fieldMatch = null;
    // No classified entry has ANY field data at all — nothing to compare the
    // required field against. This could be a genuinely field-less
    // qualification (an MBA/PhD entry, or a CV that honestly states none) or
    // an extraction gap; there is no way to tell which from here, so per 5.6
    // it is flagged for review below rather than silently scored as a
    // non-match.
    let fieldNotExtracted = false;
    if (requirements.requiredQualification.field) {
      const fields = classified.filter((c) => c.field).map((c) => c.field);
      if (!fields.length) {
        fieldNotExtracted = true;
      } else {
        fieldMatch = matchTermSet([requirements.requiredQualification.field], fields);
      }
    }
    qual = qualificationScore(requirements.requiredQualification, { levelMet, fieldMatch, classifiedEducation: classified });

    // 5.6: "an invented qualification is more serious than an invented
    // skill. Treat an unverifiable qualification as an extraction failure
    // requiring review, not a silently dropped field." Two distinct review
    // reasons, both ending in the same needsReview/score:0 treatment:
    //   - "field-not-extracted": the level was met but there's no field data
    //     to compare against the requirement at all (checked first — there's
    //     nothing here for the grounding check below to even look at).
    //   - "unverifiable": a field WAS matched, but the matched degree text
    //     isn't grounded in the CV — the credit is withdrawn and flagged.
    let needsReview = false;
    let reviewReason = null;
    let flaggedQualification = null;
    if (levelMet && requirements.requiredQualification.field && fieldNotExtracted) {
      needsReview = true;
      reviewReason = "field-not-extracted";
    } else if (qual.matched.length) {
      qualVerification = await verifyTerm(qual.matched[0], extractedText, { embedTexts, threshold: QUAL_SIMILARITY_THRESHOLD });
      if (qualVerification.status === "unverifiable") {
        needsReview = true;
        reviewReason = "unverifiable";
        flaggedQualification = qual.matched[0];
        qual = { ...qual, score: 0, matched: [] };
      }
    }

    qualBreakdown = {
      score: qual.score, max: qual.max, levelMet: qual.levelMet, matched: qual.matched,
      ...(needsReview ? { needsReview: true, reviewReason } : {}),
      // Only present when there's an actual matched claim to point at —
      // "field-not-extracted" has no specific claim, just an absence.
      ...(flaggedQualification ? { flaggedQualification } : {}),
    };
  }

  const { overallScore, capApplied } = aggregateScore({
    qual,
    skillsScore: core.score,
    experienceScoreValue: experience.score,
    niceToHaveScore: preferred.score,
  });

  const allVerifications = qualVerification ? [...core.verification, ...preferred.verification, qualVerification] : [...core.verification, ...preferred.verification];
  const verification = tallyVerification(allVerifications);

  return {
    overallScore,
    capApplied,
    breakdown: {
      qualifications: qualBreakdown,
      coreSkills: { score: core.score, max: core.max, matched: core.matched, missing: core.missing },
      experience,
      preferredSkills: { score: preferred.score, max: preferred.max, matched: preferred.matched, missing: preferred.missing },
    },
    // Not part of 5.7's output schema — this is the 5.4 decision record's
    // instrumentation (test-fixtures/ws6-results.md), relabeled 2026-09-12 to
    // track verifyTerm()'s (5.6) firing rate now that matching.js's layer 3
    // is gone: how many matched terms per application verified via literal
    // text search vs. needed an embedding call, and how many of those sat
    // close enough to the threshold to be exposed to the 6.4 embedding
    // non-reproducibility finding. A counter, not a feature — nothing reads
    // this at scoring time.
    instrumentation: {
      verification: { literal: verification.literal, embedding: verification.embedding },
      borderline: verification.borderline,
    },
  };
}

/**
 * Score every candidate against one vacancy. A shared, memoizing embed cache
 * means a vacancy-side term that reaches layer 3 for one candidate is never
 * re-embedded for the next (5.5: "cache vacancy-requirement embeddings —
 * they are static") — but nothing is embedded speculatively. Pre-warming
 * every requiredSkill/niceToHave/qualification-field up front regardless of
 * whether layer 1 will end up matching them would spend Neurons a
 * layer-1-only batch never needed and silently break the "zero embedding
 * calls when normalisation suffices" guarantee at the batch level, even
 * though each individual scoreApplication call still gets it right alone.
 * One candidate's scoring failure never aborts the rest (10.1) — it's
 * reported as `status: "failed"`, never a zero score.
 */
export async function scoreApplications(candidates, requirements, deps) {
  const cache = new Map();
  const cachedEmbed = async (texts) => {
    const uncached = texts.filter((t) => !cache.has(t));
    if (uncached.length) {
      const vectors = await deps.embedTexts(uncached);
      uncached.forEach((t, i) => cache.set(t, vectors[i]));
    }
    return texts.map((t) => cache.get(t));
  };

  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    // Derived inside the try, not before it — a malformed candidate record
    // (null, missing fields) must fail THAT entry, never the whole batch.
    let candidateId = `index:${i}`;
    try {
      candidateId = candidate?.candidateId || candidate?.id || candidateId;
      const result = await scoreApplication(candidate, requirements, { ...deps, embedTexts: cachedEmbed });
      results.push({ candidateId, status: "scored", result });
    } catch (e) {
      results.push({ candidateId, status: "failed", error: e.message });
    }
  }
  return results;
}

/**
 * 5.8 — deterministic ranking. overallScore desc, then core-skills score
 * desc, then candidateId lexicographic ascending. ID rather than submission
 * timestamp: FIFO systematically rewards applying early, independent of
 * merit. Genuinely-tied candidates keep whatever order this produces — it's
 * the caller's job to *display* them as tied, this only guarantees the same
 * input always produces the same order.
 */
export function sortApplications(scored) {
  return [...scored].sort((a, b) => {
    if (a.status !== "scored" && b.status !== "scored") return 0;
    if (a.status !== "scored") return 1; // unscored applications sort last, never treated as a 0
    if (b.status !== "scored") return -1;
    if (b.result.overallScore !== a.result.overallScore) return b.result.overallScore - a.result.overallScore;
    const aCore = a.result.breakdown.coreSkills.score;
    const bCore = b.result.breakdown.coreSkills.score;
    if (bCore !== aCore) return bCore - aCore;
    return String(a.candidateId).localeCompare(String(b.candidateId));
  });
}
