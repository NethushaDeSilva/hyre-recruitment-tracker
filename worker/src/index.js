// Hyre — "Filter with AI" worker (smart candidate screening).
//
// Contract:
//   POST { criteria: string, candidates: [{ id, name, appliedRole,
//          highestQualification, fieldOfStudy, experience, currentRole,
//          currentCompany, skills, coverNote }] }
//   ->   { summary: string,
//          ranked: [{ id, score (0-100), verdict, reason }] }  (best first)
//
// It runs Meta Llama via Cloudflare Workers AI (env.AI) — no API key involved.
// The model is told to READ the recruiter's request as priorities + rules (not
// just keywords): infer must-haves vs nice-to-haves, honour flexible instructions
// (e.g. "qualifications matter less than skills", "give strong juniors a chance"),
// credit transferable experience and potential, and judge ONLY on skills /
// experience / qualifications — never any protected attribute. It ranks and
// explains; a human still makes every decision.

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // current, capable Meta model
const MAX_CANDIDATES = 50;
const MAX_NOTE = 1000; // give the model more of the cover note to reason over

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*", // TODO: tighten to your Hyre domain
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "POST only" }, 405, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400, cors);
    }

    const criteria = String(body.criteria || "").trim().slice(0, 4000);
    const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, MAX_CANDIDATES) : [];
    if (!criteria) return json({ error: "Missing 'criteria'." }, 400, cors);
    if (!candidates.length) return json({ error: "No candidates to screen." }, 400, cors);

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
      "Credit transferable and adjacent experience (e.g. 'built customer web apps in React' counts toward a Frontend role even without the exact keyword), " +
      "and reward evidence of real impact (leading teams, shipping, scale). " +
      "Judge ONLY on skills, experience, qualifications and role relevance. NEVER use or infer age, gender, race, religion, nationality or any protected attribute. " +
      "You rank and explain; a human makes the final decision. Spread scores meaningfully so the best candidates clearly stand out. " +
      "Respond with STRICT JSON only — no preamble, no markdown.";

    const user =
      `Recruiter's request: "${criteria}"\n\n` +
      `Candidates:\n${profiles}\n\n` +
      `Return ONLY this JSON shape:\n` +
      `{"summary":"<1-2 sentences on the shortlist and how you weighed the request>",` +
      `"ranked":[{"id":"<candidate id>","score":<integer 0-100>,` +
      `"verdict":"Strong"|"Possible"|"Weak",` +
      `"reason":"<one sentence: why, noting any trade-off e.g. low qualification offset by strong experience>"}]}\n` +
      `Include EVERY candidate exactly once, sorted by score from highest to lowest.`;

    let ai;
    try {
      ai = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 3500,
        temperature: 0.3,
      });
    } catch (e) {
      return json({ error: "AI call failed", detail: String(e) }, 502, cors);
    }

    const raw = (ai && (ai.response ?? ai.result?.response)) ?? "";
    // Newer Workers AI models return `response` already parsed as an object;
    // older ones return a JSON string. Handle both.
    const parsed = raw && typeof raw === "object" ? raw : extractJson(raw);
    if (!parsed || !Array.isArray(parsed.ranked)) {
      return json({ error: "Could not parse AI response", raw }, 200, cors);
    }

    const VERDICTS = ["Strong", "Possible", "Weak"];
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "";
    const ranked = parsed.ranked
      .filter((r) => r && r.id != null)
      .map((r) => {
        const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
        const verdict = VERDICTS.includes(r.verdict)
          ? r.verdict
          : score >= 75
          ? "Strong"
          : score >= 50
          ? "Possible"
          : "Weak";
        return { id: String(r.id), score, verdict, reason: String(r.reason || "").slice(0, 400) };
      })
      .sort((a, b) => b.score - a.score);

    return json({ summary, ranked }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function extractJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
