import DOMPurify from "dompurify";

// Strict allowlist for reviewer/stage-move comments (the RichCommentEditor in
// CandidateDetailModal). Matches EXACTLY what the editor's toolbar can
// produce — bold/italic/lists — plus the structural tags TinyMCE wraps
// content in (p, br). Nothing else survives: no style/class/on* attributes
// at all, no color/highlight/font controls, no tables, images, links or
// scripts — even if pasted in from Word. Comments are shown to other users,
// so this is applied both on save (addComment in src/data/store.js) and
// again on every render (CandidateDetailModal, wherever a comment is
// displayed) as defense in depth — never trust that a stored value was
// already sanitized by the one prior save path.
const ALLOWED_TAGS = ["b", "strong", "i", "em", "ul", "ol", "li", "p", "br"];

export function sanitizeComment(html) {
  return DOMPurify.sanitize(html ?? "", {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  }).trim();
}

// True if sanitizing would strip everything meaningful — the RTE can leave
// behind an empty "<p></p>" that reads as blank but isn't falsy like "".
// Mirrors the old plain-text `text.trim()` emptiness check for callers that
// need to know "did the user actually write anything."
export function isSanitizedCommentEmpty(html) {
  const clean = sanitizeComment(html);
  return !clean || !clean.replace(/<[^>]*>/g, "").trim();
}
