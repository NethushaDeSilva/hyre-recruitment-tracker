// Hyre — text embeddings via Cloudflare Workers AI, same-origin.
// Powers WS6.1 threshold calibration (scripts/calibrate-thresholds.mjs).
// The WS5 scoring engine calls runEmbeddings() directly, in-process — this
// route exists for calibration (a plain Node script, no Workers AI binding
// of its own) and any other out-of-Worker caller, not for the engine's own
// runtime path. Both go through the same shared function, so calibration
// measures the exact call scoring makes.
//
// Contract:
//   POST { text: string[] }   (batch, max 100 strings per call, 2000 chars each)
//   -> { embeddings: number[][] }   (768-dim vectors, same order as input)

import { runEmbeddings } from "../_lib/embeddings.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const input = Array.isArray(body.text) ? body.text : [body.text];
  if (!input.some((t) => typeof t === "string" && t.trim())) {
    return json({ error: "No text to embed." }, 400);
  }

  try {
    const embeddings = await runEmbeddings(env, input);
    return json({ embeddings, truncatedInputIndexes: embeddings.flatMap((v, i) => v.inputTruncated ? [i] : []) }, 200);
  } catch (e) {
    return json({ error: e.message || "Embedding model call failed." }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
