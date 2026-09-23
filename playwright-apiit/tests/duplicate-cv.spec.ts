import { test } from '@playwright/test';

// Searched the codebase (src/lib, src/components, src/pages) for any
// duplicate-CV / duplicate-applicant detection feature — e.g. flagging two
// applications backed by the same CV file/content, or the same person
// applying under two different emails. Nothing exists: `duplicate` only
// appears as an unrelated guard in src/lib/candidatePreference.js
// ("duplicate positions" in one applicant's own application list) and a
// comment in OpenPositionModal.jsx about stage pickers. There's no CV-hash
// comparison, no "this CV was already submitted" warning, and no
// cross-candidate duplicate detection anywhere in the app.
//
// Rather than invent behavior to assert against, this is skipped — the
// feature this file is meant to cover doesn't exist yet on the live site.
test.skip('a CV that was already submitted (by this or another candidate) is flagged as a duplicate', () => {
  // Not implemented anywhere in the app — see comment above. Nothing to test.
});
