// Hyre — shared Workers AI embedding call. Used by /api/embed (calibration,
// HTTP round trip) AND directly by the WS5 scoring engine (in-process, no
// HTTP hop — Worker CPU time is limited per 5.5). One implementation, so
// calibration always measures the exact call scoring makes at runtime.

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const MAX_TEXTS = 100;
const MAX_CHARS = 2000;

/**
 * @param {{AI: {run: Function}}} env - Cloudflare Workers AI binding
 * @param {string[]} texts
 * @returns {Promise<number[][]>} embeddings, same order as `texts`
 */
export async function runEmbeddings(env, texts) {
  const clean = texts
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, MAX_TEXTS)
    .map((t) => t.trim().slice(0, MAX_CHARS));
  if (!clean.length) return [];

  const result = await env.AI.run(EMBEDDING_MODEL, { text: clean });
  const embeddings = result?.data;
  if (!Array.isArray(embeddings) || embeddings.length !== clean.length) {
    throw new Error("Embedding model returned an unexpected shape.");
  }
  return embeddings;
}
