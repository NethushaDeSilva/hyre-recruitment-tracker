import { planRequirements } from "./requirement-plan.js";
import { analyzeDescription, applyDescriptionFit } from "./job-description.js";
// WS5 — the orchestration layer around the pure scoring engine. Everything
// here is the IMPURE half of 5.1's hybrid architecture: it touches Workers
// AI (embeddings) and the clock, then hands off to engine.js for the actual
// scoring, which touches neither. Named "-ai.js" to match cv-ai.js's role —
// the thing that calls out to model infrastructure — as distinct from the
// pure computational core in filtration/.
//
// meta (model IDs, thresholds, engineVersion, scoredAt) is assembled HERE,
// after engine.js returns, never inside it — see engine.js's own comment on
// scoreApplication for why that split matters.

import { runEmbeddings, EMBEDDING_MODEL } from "./embeddings.js";
import { scoreApplication, scoreApplications, ENGINE_VERSION, ScoringError } from "./filtration/engine.js";
import { getThresholds } from "./filtration/thresholds.js";
import { ELIGIBILITY_VERSION, CORRECTNESS_VERSION } from "./filtration/eligibility.js";

export { ScoringError };

function buildMeta(candidate, now) {
  const { SKILL_SIMILARITY_THRESHOLD, QUAL_SIMILARITY_THRESHOLD } = getThresholds();
  return {
    extractionModel: candidate.extractionModel || null,
    embeddingModel: EMBEDDING_MODEL,
    skillThreshold: SKILL_SIMILARITY_THRESHOLD,
    qualThreshold: QUAL_SIMILARITY_THRESHOLD,
    engineVersion: ENGINE_VERSION,
    eligibilityVersion: ELIGIBILITY_VERSION,
    correctnessVersion: CORRECTNESS_VERSION,
    scoredAt: now().toISOString(),
  };
}

/**
 * Score one application against one vacancy's requirements. Fetches
 * embeddings via Workers AI (env.AI) as the engine needs them — 5.5's "embed
 * each unique string once per request" happens automatically here since a
 * single scoreApplication call never re-embeds the same string twice within
 * itself; see scoreVacancyApplications below for the cross-candidate cache.
 *
 * Throws ScoringError (from engine.js) when the vacancy has no structured
 * requirements — the caller (the API route) is responsible for turning that
 * into 10.1's "block scoring with a clear message" response, never a score.
 *
 * @param {{candidate: object, requirements: object, env: object, now?: () => Date}} args
 * @returns {Promise<object>} the full 5.7-shaped result: overallScore,
 *   capApplied, breakdown, meta, instrumentation
 */
export async function scoreOneApplication({ candidate, requirements, env, now = () => new Date() }) {
  if (!requirements?.requiredSkills?.length) throw new ScoringError("Vacancy has no structured requirements to score against.");
  const embedTexts = (texts) => runEmbeddings(env, texts);
  const requirementPlan = await planRequirements(requirements, env);
  const result = await scoreApplication(candidate, requirements, { embedTexts, requirementPlan });
  const contextual = requirements?.jobContext?.description ? await applyDescriptionFit(result, candidate, await analyzeDescription(requirements, env), embedTexts) : result;
  return { ...contextual, meta: buildMeta(candidate, now) };
}

/**
 * Score every candidate against one vacancy, sharing ONE embedding cache
 * across the whole batch (5.5: "cache vacancy-requirement embeddings — they
 * are static") — this is where that actually happens, since engine.js's own
 * scoreApplications() already builds a shared cache internally and this just
 * supplies it with the real Workers AI call instead of a test double.
 *
 * @param {{candidates: object[], requirements: object, env: object, now?: () => Date}} args
 * @returns {Promise<Array<{candidateId: string, status: "scored"|"failed", result?: object, error?: string}>>}
 */
export async function scoreVacancyApplications({ candidates, requirements, env, now = () => new Date() }) {
  if (!requirements?.requiredSkills?.length) throw new ScoringError("Vacancy has no structured requirements to score against.");
  const embedTexts = (texts) => runEmbeddings(env, texts);
  const responsibilities = requirements?.jobContext?.description ? await analyzeDescription(requirements, env) : null;
  const cache = new Map();
  const cachedEmbed = async texts => {
    const missing = [...new Set(texts.filter(t => !cache.has(t)))];
    if (missing.length) { const vectors = await embedTexts(missing); missing.forEach((t,i) => cache.set(t,vectors[i])); }
    return texts.map(t => cache.get(t));
  };
  const requirementPlan = await planRequirements(requirements, env);
  const results = await scoreApplications(candidates, requirements, { embedTexts: cachedEmbed, requirementPlan });
  const output = [];
  for (const row of results) {
    if (row.status !== "scored") { output.push(row); continue; }
    const candidate = candidates.find(c => (c.candidateId || c.id) === row.candidateId) || {};
    try {
      const result = responsibilities === null ? row.result : await applyDescriptionFit(row.result, candidate, responsibilities, cachedEmbed);
      output.push({ ...row, result: { ...result, meta: buildMeta(candidate, now) } });
    } catch (error) { output.push({ candidateId: row.candidateId, status: "failed", error: error.message }); }
  }
  return output;
}
