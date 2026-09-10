// Shared field validators. Small and boring on purpose — one implementation,
// reused everywhere a form needs the same check, so it can never quietly
// drift between the public apply flow and HR's manual entry forms.

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

// A "name" field that's actually an email address is a specific, recurring
// failure mode — not a hypothetical one. It happens when a browser's autofill
// cross-fills a saved email into an adjacent name input (see AddCandidateModal:
// a bare "Full name" field sitting right above "Email address", no
// autoComplete hint, no validation — exactly the shape that trips a browser's
// autofill heuristics). Catch it at the data layer, not just the DOM attribute.
export const looksLikeEmail = (v) => isEmail(v);

/** @returns {string} an error message, or "" if the name is fine. */
export function nameFieldError(v) {
  const name = String(v || "").trim();
  if (!name) return "Full name is required.";
  if (looksLikeEmail(name)) return "That looks like an email address, not a name — please enter the person's actual name.";
  return "";
}
