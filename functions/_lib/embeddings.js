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
  if (!Array.isArray(texts) || texts.some(t => typeof t !== "string" || !t.trim())) {
    throw new Error("Invalid embedding input: expected nonempty strings.");
  }
  const embeddings = [];
  for (let start = 0; start < texts.length; start += MAX_TEXTS) {
    const originals = texts.slice(start, start + MAX_TEXTS).map(t => t.trim());
    const result = await env.AI.run(EMBEDDING_MODEL, { text: originals.map(t => t.slice(0, MAX_CHARS)) });
    if (!Array.isArray(result?.data) || result.data.length !== originals.length ||
        result.data.some(v => !Array.isArray(v) || !v.length || v.some(n => !Number.isFinite(n)))) {
      throw new Error("Embedding model returned an unexpected shape or count.");
    }
    result.data.forEach((vector, i) => {
      // Preserve the numeric-array API used by calibration. Metadata travels
      // with each vector through the per-request cache; HTTP emits it separately.
      const copy = [...vector];
      if (originals[i].length > MAX_CHARS) copy.inputTruncated = true;
      embeddings.push(copy);
    });
  }
  if (embeddings.length !== texts.length) throw new Error("Embedding count mismatch.");
  return embeddings;
}
