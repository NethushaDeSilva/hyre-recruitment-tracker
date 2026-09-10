// Hyre — text embeddings via Cloudflare Workers AI, same-origin.
// Powers WS6.1 threshold calibration (scripts/calibrate-thresholds.mjs) and,
// later, WS5's live skill/qualification equivalence matching (5.4/5.5) — the
// SAME model call, so calibration measures the exact distribution scoring
// will run against at runtime.
//
// Contract:
//   POST { text: string[] }   (batch, max 100 strings per call, 2000 chars each)
//   -> { embeddings: number[][] }   (768-dim vectors, same order as input)

const MODEL = "@cf/baai/bge-base-en-v1.5";
const MAX_TEXTS = 100;
const MAX_CHARS = 2000;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const input = Array.isArray(body.text) ? body.text : [body.text];
  const clean = input
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, MAX_TEXTS)
    .map((t) => t.trim().slice(0, MAX_CHARS));

  if (!clean.length) return json({ error: "No text to embed." }, 400);

  try {
    const result = await env.AI.run(MODEL, { text: clean });
    const embeddings = result?.data;
    if (!Array.isArray(embeddings) || embeddings.length !== clean.length) {
      return json({ error: "Embedding model returned an unexpected shape." }, 502);
    }
    return json({ embeddings }, 200);
  } catch (e) {
    return json({ error: e.message || "Embedding model call failed." }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
