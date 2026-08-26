// Hyre — "Filter with AI" as a Cloudflare Pages Function at /api/screen.
//
// Served same-origin (see functions notes) so no host/CORS/CSP can block it.
// Runs Meta Llama via Cloudflare Workers AI (env.AI) — no API key.
//
// RELIABILITY CONTRACT: this endpoint must NEVER surface an error to HR. The AI
// model is slow (~7-11s) and can occasionally time out, rate-limit, or emit
// unparseable output. So we (1) bound the model call with a server-side timeout,
// (2) parse defensively, and (3) if the model fails for ANY reason, fall back to a
// deterministic keyword ranking. Either way we return 200 with {summary, ranked}.
//
// Contract:
//   POST { criteria: string, candidates: [{ id, name, appliedRole,
//          highestQualification, fieldOfStudy, experience, currentRole,
//          currentCompany, skills, coverNote }] }
//   ->   { summary: string, ranked: [{ id, score (0-100), verdict, reason }],
//          fallback?: true }

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_CANDIDATES = 50;
const MAX_NOTE = 1000;
const MODEL_TIMEOUT_MS = 24000; // give up on the model well before any edge timeout

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const criteria = String(body.criteria || "").trim().slice(0, 4000);
  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, MAX_CANDIDATES) : [];
  if (!criteria) return json({ error: "Missing 'criteria'." }, 400);
  if (!candidates.length) return json({ error: "No candidates to screen." }, 400);

  const profiles = candidates
    .map(
      (c, i) =>
        `#${i + 1} (id: ${c.id})
Name: ${c.name || "-"}
Applied for: ${c.appliedRole || "-"}
Highest qualification: ${c.highestQualification || "-"} in ${c.fieldOfStudy || "-"}
Years of experience: ${c.experience || "-"}
Current/recent role: ${c.currentRole || "-"} @ ${c.currentCompany || "-"}
Skills: ${c.skills || "-"}
Cover note: ${String(c.coverNote || "").slice(0, MAX_NOTE) || "-"}`
    )
    .join("\n\n");

  const system =
    "You are an expert, fair technical recruiter helping shortlist candidates. " +
    "Treat the recruiter's request as PRIORITIES and RULES to reason with — not just keywords to match. " +
    "First infer what is a MUST-HAVE versus a NICE-TO-HAVE from their wording. " +
    "Honour flexible or conditional instructions exactly: e.g. if they say qualifications matter less than skills, weight formal qualifications lightly; " +
    "if they say give strong juniors or high-potential people a chance, reward demonstrated ability and growth even with fewer years; " +
    "if they name a hard requirement, penalise candidates who clearly lack it. " +
    "Credit transferable and adjacent experience, and reward evidence of real impact (leading teams, shipping, scale). " +
    "Judge ONLY on skills, experience, qualifications and role relevance. NEVER use or infer age, gender, race, religion, nationality or any protected attribute. " +
    "You rank and explain; a human makes the final decision. Spread scores meaningfully so the best candidates clearly stand out. " +
    "Respond with STRICT, COMPLETE, VALID JSON only — no preamble, no markdown, no trailing commentary.";

  const user =
    `Recruiter's request: "${criteria}"\n\n` +
    `Candidates:\n${profiles}\n\n` +
    `Return ONLY this JSON shape (and nothing else):\n` +
    `{"summary":"<1-2 sentences on the shortlist and how you weighed the request>",` +
    `"ranked":[{"id":"<candidate id>","score":<integer 0-100>,` +
    `"verdict":"Strong"|"Possible"|"Weak",` +
    `"reason":"<one short sentence: why, noting any trade-off>"}]}\n` +
    `Include EVERY candidate exactly once, sorted by score from highest to lowest. Keep reasons short so the JSON stays complete.`;

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  // Single, time-bounded model attempt. Never throws — returns parsed object or null.
  const parsed = await tryModel(env, messages);

  let summary;
  let rawRanked;
  let fallback = false;
  if (parsed && Array.isArray(parsed.ranked) && parsed.ranked.length) {
    summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "";
    rawRanked = parsed.ranked;
  } else {
    const fb = fallbackRank(criteria, candidates);
    summary = fb.summary;
    rawRanked = fb.ranked;
    fallback = true;
  }

  // Normalise: every candidate appears exactly once, scores clamped, verdicts valid.
  const ranked = normalizeRanked(rawRanked, candidates);
  return json({ summary, ranked, fallback }, 200);
}

// --- model call (defensive, time-bounded, never throws) ---
async function tryModel(env, messages) {
  try {
    const ai = await withTimeout(
      env.AI.run(MODEL, { messages, max_tokens: 4000, temperature: 0.15 }),
      MODEL_TIMEOUT_MS
    );
    const raw = (ai && (ai.response ?? ai.result?.response)) ?? "";
    const obj = raw && typeof raw === "object" ? raw : extractJson(raw);
    return obj && Array.isArray(obj.ranked) ? obj : null;
  } catch {
    return null;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("model-timeout")), ms)),
  ]);
}

// --- deterministic fallback: keyword relevance, so we ALWAYS return a ranking ---
const STOP = new Set([
  "the", "and", "for", "with", "who", "can", "are", "our", "you", "your", "but", "not", "has", "have",
  "a", "an", "of", "to", "in", "on", "or", "is", "be", "as", "at", "it", "we", "i", "plus", "over",
  "more", "than", "even", "if", "low", "base", "must", "should", "prefer", "preferred", "years", "year",
  "experience", "skills", "candidate", "candidates", "role", "strong", "open", "high", "potential", "do", "work",
]);

function fallbackRank(criteria, candidates) {
  const terms = [...new Set((criteria.toLowerCase().match(/[a-z0-9+#.]{3,}/g) || []).filter((t) => !STOP.has(t)))];
  const ranked = candidates.map((c) => {
    const hay = `${c.skills || ""} ${c.experience || ""} ${c.currentRole || ""} ${c.currentCompany || ""} ${c.fieldOfStudy || ""} ${c.highestQualification || ""} ${c.appliedRole || ""} ${c.coverNote || ""}`.toLowerCase();
    const hits = terms.filter((t) => hay.includes(t));
    const score = terms.length ? Math.round((hits.length / terms.length) * 100) : 50;
    const reason = hits.length
      ? `Matches ${hits.slice(0, 4).join(", ")}${hits.length > 4 ? "…" : ""}.`
      : "No clear keyword match to your criteria — review manually.";
    return { id: String(c.id), score, reason };
  });
  return {
    summary: "Quick keyword-based ranking (the AI model was momentarily busy). Press Screen again in a moment for a full AI review.",
    ranked,
  };
}

// --- normalise any ranked list to a clean, complete, sorted array ---
function normalizeRanked(list, candidates) {
  const VERDICTS = ["Strong", "Possible", "Weak"];
  const byId = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || r.id == null) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    const verdict = VERDICTS.includes(r.verdict) ? r.verdict : score >= 75 ? "Strong" : score >= 50 ? "Possible" : "Weak";
    byId.set(String(r.id), { id: String(r.id), score, verdict, reason: String(r.reason || "").slice(0, 400) });
  }
  // Guarantee every input candidate is present exactly once (drops any hallucinated ids).
  return candidates
    .map(
      (c) =>
        byId.get(String(c.id)) || {
          id: String(c.id),
          score: 0,
          verdict: "Weak",
          reason: "Not enough information to assess against your criteria.",
        }
    )
    .sort((a, b) => b.score - a.score);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractJson(text) {
  const s = String(text).trim();
  try { return JSON.parse(s); } catch {}
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
