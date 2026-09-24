import { sanitizeComment } from "@/lib/sanitizeHtml";

// Renders stored comment HTML — sanitizes AGAIN at render time (defense in
// depth; never trust that whatever's in Firestore was actually sanitized on
// the way in, since old data, a future write path, or a compromised client
// could bypass that). See src/lib/sanitizeHtml.js for the allowlist.
export default function SafeHtml({ html, className }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: sanitizeComment(html) }} />;
}
