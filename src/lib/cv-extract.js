// WS3 — client-side CV content validation. Extracts text from the file, runs
// cheap checks that never leave the browser, and — ONLY if those pass — asks
// the Cloudflare Worker (functions/api/validate-cv.js) to classify whether
// this reads like a real CV.
//
// validateCvContent() NEVER throws and NEVER silently resolves to a pass on
// failure. Every path returns exactly one of three outcomes:
//   { outcome: "passed",  needsReview, confidence, reason }
//   { outcome: "blocked", reason, missingSections, stage, confidence? }
//   { outcome: "errored" }  -- OUR infrastructure, not their file. The caller
//                              must offer a retry, never treat this as a pass
//                              and never tell the candidate their CV is bad.

// Fail loudly at import time if a VITE_-prefixed env var resolves to garbage.
// The undeployed/unreachable-Worker symptom this project hit earlier traced
// back to exactly this class of bug elsewhere in the stack: a misconfigured
// build produces the literal string "undefined" baked into the URL instead of
// throwing, and the failure only surfaces later as an opaque network error.
// The empty-string default here can never trigger that (both fall back to a
// same-origin relative path), so this only fires if an env var is explicitly
// SET to something broken — which is exactly the case worth crashing on.
function resolveApiBase(envValue, fallbackPath, label) {
  const url = envValue || fallbackPath;
  if (!url || url.includes("undefined") || url.includes("null")) {
    throw new Error(
      `[cv-extract] ${label} resolved to an invalid URL ("${url}"). ` +
      `A VITE_-prefixed env var is likely set to a broken value, or was added ` +
      `to .env.local without restarting the dev server (Vite does not hot-reload env vars).`
    );
  }
  return url;
}

const VALIDATE_URL = resolveApiBase(import.meta.env.VITE_CV_VALIDATE_URL, "/api/validate-cv", "VITE_CV_VALIDATE_URL");

const MIN_CHARS = 200;
// No upper bound — 5.9: "Long documents are truncated, never rejected." What
// gets SENT to the model is still budget-limited (truncateForModel), but the
// full extracted text is always what's checked, stored, and returned here.

// Keep this list in sync with ALL_SECTIONS in functions/api/validate-cv.js —
// the two run independently (client heuristic vs. server fallback) but should
// agree on what "the standard CV sections" are.
const SECTION_MARKERS = [
  { key: "work experience", re: /\b(work experience|professional experience|employment history|career history)\b/i },
  { key: "education", re: /\beducation\b/i },
  { key: "skills", re: /\bskills\b/i },
  { key: "work history", re: /\bwork history\b/i },
  { key: "contact details", re: /[^\s@]+@[^\s@]+\.[^\s@]+/ }, // an email address anywhere in the text
];

function checkSections(text) {
  const found = [];
  const missing = [];
  for (const { key, re } of SECTION_MARKERS) {
    (re.test(text) ? found : missing).push(key);
  }
  return { found, missing };
}

const extOf = (name) => String(name).split(".").pop().toLowerCase();

// --- extraction ------------------------------------------------------------
// Both loaded via dynamic import so pdfjs-dist / mammoth aren't in the main
// bundle — only fetched once a candidate actually picks a file.

async function extractPdfText(file) {
  const pdfjsLib = await import("pdfjs-dist");
  // Vite resolves this to a real, fingerprinted asset URL at build time.
  // pdf.js runs the actual parsing in this worker, off the main thread.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;

  const buf = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data: buf,
      // Standard (non-embedded) font metrics — pdf.js warns without this even
      // though we only ever call getTextContent(), never render(). Copied
      // once from node_modules/pdfjs-dist/standard_fonts (v6.3.289) into
      // public/ so it's served at a stable same-origin URL; re-copy if
      // pdfjs-dist is ever upgraded.
      standardFontDataUrl: new URL("/pdf-standard-fonts/", window.location.origin).href,
    }).promise;
  } catch (err) {
    if (err?.name === "PasswordException") return { kind: "password" };
    return { kind: "unreadable" }; // genuinely can't tell what's wrong — not the candidate's fault to assume
  }

  let text = "";
  // Cap pages read — a 50-page CV is a real case to handle, but we only need
  // enough text to validate + classify, not the whole document. This is a
  // read-time performance guard only, unrelated to 5.9's truncation (which
  // never rejects a long CV) — it just stops pulling MORE pages once there's
  // already far more text than any legitimate CV needs.
  const PDF_READ_STOP_CHARS = 40000;
  const pagesToRead = Math.min(doc.numPages, 30);
  for (let i = 1; i <= pagesToRead; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str || "").join(" ") + "\n";
    if (text.length > PDF_READ_STOP_CHARS) break; // already plenty, stop early
  }
  return { kind: "ok", text: text.trim() };
}

async function extractDocxText(file) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { kind: "ok", text: (result.value || "").trim() };
  } catch {
    return { kind: "unreadable" };
  }
}

/** Never throws — always resolves to a `kind` describing what happened. */
async function extractCvText(file) {
  const ext = extOf(file.name);
  if (ext === "pdf") return extractPdfText(file);
  if (ext === "docx") return extractDocxText(file);
  // Legacy binary .doc has no viable lightweight client-side text extractor
  // (mammoth only reads OOXML .docx). Turned away here with a specific,
  // actionable message rather than silently mis-validating it.
  if (ext === "doc") return { kind: "unsupported-doc" };
  return { kind: "unreadable" };
}

// --- AI classification -------------------------------------------------------

const RETRY_BACKOFF_MS = 700;

async function requestValidation(text, sectionsFound) {
  // Full text — the Worker truncates authoritatively (truncateForModel, 5.9)
  // and reports truncationApplied/truncationStrategy back in the response.
  const res = await fetch(VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sectionsFound }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`validate-cv returned HTTP ${res.status}`);
    err.status = res.status;
    err.body = body.slice(0, 500);
    throw err;
  }
  const data = await res.json();
  if (typeof data?.isCv !== "boolean" || typeof data?.confidence !== "number") {
    const err = new Error("validate-cv returned an unexpected shape");
    err.body = JSON.stringify(data).slice(0, 500);
    throw err;
  }
  return data; // { isCv, confidence, reason, missingSections, fallback? }
}

// One retry with a short backoff for transient failures (network blip, cold
// start) — logs the real status/body to the console either way, so a genuine
// misconfiguration (wrong URL, function not deployed, CORS) is visible in
// devtools instead of just a generic "couldn't check your CV" on screen.
async function classifyWithWorker(text, sectionsFound) {
  try {
    return await requestValidation(text, sectionsFound);
  } catch (err) {
    console.error(
      `[cv-extract] validate-cv call failed (${err.status ?? "network error"}): ${err.message}`,
      err.body || ""
    );
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    try {
      return await requestValidation(text, sectionsFound);
    } catch (err2) {
      console.error(
        `[cv-extract] validate-cv retry also failed (${err2.status ?? "network error"}): ${err2.message}`,
        err2.body || ""
      );
      throw err2; // validateCvContent() turns this into { outcome: "errored" } — never a pass
    }
  }
}

// Cheap GET ping — not a validation call, just "is this endpoint deployed and
// bound to env.AI right now." Returns a structured result rather than a bare
// boolean so a caller (the app-load health banner) can say WHY it's down.
async function pingEndpoint(url, label) {
  try {
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      console.error(`[cv-extract] ${label} Worker health check failed (HTTP ${res.status}):`, data);
      return { ok: false, status: res.status, detail: data };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error(`[cv-extract] ${label} Worker is unreachable:`, err.message);
    return { ok: false, status: null, detail: err.message };
  }
}

/**
 * Confirm the CV validation Worker (WS3) is actually deployed and reachable.
 * Call this once when the apply flow becomes available, so a misconfigured
 * or undeployed Worker shows up immediately rather than only the first time
 * a candidate actually submits a CV.
 */
export async function healthCheckCvValidator() {
  return pingEndpoint(VALIDATE_URL, "CV validation");
}

// --- WS4: CV parsing/extraction ---------------------------------------------

const PARSE_URL = resolveApiBase(import.meta.env.VITE_CV_PARSE_URL, "/api/parse-cv", "VITE_CV_PARSE_URL");

/** Confirm the CV parsing Worker (WS4) is actually deployed and reachable. */
export async function healthCheckCvParser() {
  return pingEndpoint(PARSE_URL, "CV parsing");
}

/**
 * App-load health check (section 7 of CLAUDE.md): runs both CV Worker
 * endpoints in parallel and reports which, if any, are down. This is what
 * drives the visible startup warning banner — a console line alone doesn't
 * count as "surfaced," because nobody but a developer with devtools open
 * would ever see it.
 */
export async function checkAiWorkersHealth() {
  const [validate, parse] = await Promise.all([healthCheckCvValidator(), healthCheckCvParser()]);
  const failed = [];
  if (!validate.ok) failed.push("CV validation");
  if (!parse.ok) failed.push("CV parsing");
  return { ok: failed.length === 0, failed };
}

/**
 * Fill the candidate profile from an already-extracted, already-validated CV's
 * text. Never throws and never blocks the application — a failed parse just
 * means the profile stays empty (no worse than before WS4 existed); it is
 * never treated as a reason to reject the application (that's WS3's job).
 * Returns the profile object, or null if parsing didn't succeed this time.
 */
export async function parseCvContent(text) {
  if (!text || !text.trim()) return null;
  try {
    const res = await fetch(PARSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }), // full text — the Worker truncates authoritatively (5.9)
    });
    if (!res.ok) {
      console.error(`[cv-extract] parse-cv returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data?.ok || !data.profile) return null;
    return { ...data.profile, extractionInputTruncated: !!data.truncationApplied };
  } catch (err) {
    console.error("[cv-extract] parse-cv call failed:", err.message);
    return null;
  }
}

// --- WS5: score automatically once WS4 parsing completes -------------------

import { scoringHeaders } from "./scoringAuth";
const SCORE_URL = resolveApiBase(import.meta.env.VITE_CV_SCORE_URL, "/api/score-application", "VITE_CV_SCORE_URL");

/** Confirm the scoring Worker (WS5) is actually deployed and reachable. */
export async function healthCheckScorer() {
  return pingEndpoint(SCORE_URL, "Application scoring");
}

/**
 * WS5 — score a freshly-parsed candidate profile against a vacancy's
 * requirements. Never throws. The candidate never triggers this directly —
 * it's called automatically right after WS4 parsing succeeds, as one more
 * link in the same validate -> parse -> score chain.
 *
 * Per 10.1, a scoring failure is never a fabricated score and never silent —
 * both non-scored outcomes are returned, not thrown, so the caller can still
 * complete the application either way:
 *   { ok: true, result }                    — scored
 *   { ok: false, reason: "no-requirements" } — vacancy has no structured requirements yet
 *   { ok: false, reason: "failed", error }   — scoring failed; "not scored — retry", never a zero
 */
export async function scoreCvAgainst(profile, extractedText, requirements) {
  if (!requirements) return { ok: false, reason: "no-requirements" };
  try {
    const res = await fetch(SCORE_URL, {
      method: "POST",
      headers: await scoringHeaders(),
      body: JSON.stringify({
        candidate: {
          skills: profile.skills || [],
          education: profile.education || [],
          totalYearsExperience: profile.totalYearsExperience || 0,
          extractionQuality: profile.extractionQuality || null,
          extractedText: extractedText || "",
        },
        requirements,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok && !data) {
      console.error(`[cv-extract] score-application returned HTTP ${res.status}`);
      return { ok: false, reason: "failed", error: `HTTP ${res.status}` };
    }
    return data; // already shaped {ok, result} or {ok:false, reason, error} by the route
  } catch (err) {
    console.error("[cv-extract] score-application call failed:", err.message);
    return { ok: false, reason: "failed", error: err.message };
  }
}

function joinNicely(list) {
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} or ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

// --- the whole pipeline ------------------------------------------------------

/** Run the full WS3 validation pipeline on a File. Never throws. */
export async function validateCvContent(file) {
  try {
    const extracted = await extractCvText(file);

    if (extracted.kind === "unsupported-doc") {
      return {
        outcome: "blocked",
        stage: "unsupported-format",
        reason: "We can't automatically read .doc files yet — please save it as a PDF or .docx and upload again.",
        missingSections: [],
      };
    }
    if (extracted.kind === "password") {
      return {
        outcome: "blocked",
        stage: "password-protected",
        reason: "This PDF is password-protected. Please remove the password and upload it again.",
        missingSections: [],
      };
    }
    if (extracted.kind === "unreadable") {
      // Couldn't parse it in a way we can name specifically — treat as OUR
      // problem, not a verdict on their file.
      return { outcome: "errored" };
    }

    const text = extracted.text || "";
    if (text.length < MIN_CHARS) {
      const isPdf = extOf(file.name) === "pdf";
      return {
        outcome: "blocked",
        stage: isPdf ? "image-only" : "too-short",
        reason: isPdf
          ? "This looks like a scanned or image-only PDF with no readable text. Please upload a text-based PDF or a Word document."
          : "This file has very little text to check. Please upload your full CV.",
        missingSections: [],
      };
    }
    // Section heuristics don't block on their own — they're recorded and
    // passed to the Worker as context (and used as its offline fallback).
    const { found } = checkSections(text);

    let ai;
    try {
      ai = await classifyWithWorker(text, found);
    } catch {
      return { outcome: "errored" };
    }

    const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));
    const missingSections = Array.isArray(ai.missingSections) ? ai.missingSections.slice(0, 10) : [];

    if (ai.isCv === false || confidence < 0.5) {
      return {
        outcome: "blocked",
        stage: "ai-classification",
        confidence,
        reason: ai.reason || "This doesn't look like a CV.",
        missingSections,
      };
    }

    return {
      outcome: "passed",
      needsReview: confidence < 0.8,
      confidence,
      reason: ai.reason || "",
      text, // handed to parseCvContent() below — WS4 reuses this extraction, never re-parses the file
      // 5.9 — whether the Worker had to truncate what it sent the model. The
      // full `text` above is unaffected; this only describes the model call.
      truncationApplied: !!ai.truncationApplied,
      truncationStrategy: ai.truncationStrategy || null,
    };
  } catch (err) {
    // Any unexpected exception anywhere above — never let it read as a pass.
    // classifyWithWorker() already logs its own network/HTTP detail; this
    // covers anything else (an extraction bug, etc.) so it's never silent.
    console.error("[cv-extract] validateCvContent failed unexpectedly:", err);
    return { outcome: "errored" };
  }
}

// Exported for the UI to build "We couldn't find: X or Y." from missingSections.
export { joinNicely };
