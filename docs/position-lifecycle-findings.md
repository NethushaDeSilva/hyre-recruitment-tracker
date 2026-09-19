# Latest update: permanent readable identities and completed production repair

Deployed on 2026-09-18 to https://hyre-hiring.pages.dev (deployment https://85149000.hyre-hiring.pages.dev). This supersedes the first `vacancy-v2-N` implementation documented below.

- New positions use title initials plus a permanent per-code sequence: `RM-01`, `RM-02`, etc. `positionSequences/RM.next` stores the last issued number. Different titles sharing the same initials share the counter to prevent collisions. Creating a position, claiming its number, and reserving its archive identity commit together.
- `positionArchive/{ID}` is permanent and cannot be deleted through the application rules. Every new position reserves a record immediately; deletion replaces it with the complete final position document plus deletion metadata. The live `positions` document is removed only after applications and related records have been cleaned up and the final archive is saved. Counters cannot be reset or deleted.
- All recoverable historical IDs were reserved: `BD-01`, `RM-01`, `HE-01`, `SFD-01`, `NE-01`, `SNE-01`, `TEST-POS`, and `X`. Per-code counters were seeded from the highest known sequences.
- The recreated Regional Manager vacancy is now **RM-02**, with **4 applications, 4 scores, 1 associated interview, and 0 hired employees**. Its title, requirements, stages, creation date, and other fields were preserved.
- Amara Jayasuriya (`SAL-RM-0037`) remains an employee with historical `positionId: RM-01`. Her original profile and employment history are unchanged; a standalone position snapshot was added. She no longer matches the RM-02 board.
- The next Regional Manager position will be **RM-03**, including after RM-02 is deleted.
- Nathan Drake's application was submitted six minutes before recreation but had pipeline actions afterward. It was retained among the four current applications based on that later activity. Its original timestamp and history are unchanged; the ambiguity and decision are recorded in `positionIdentityRepairs/RM-01`.
- The older September 9 validation log stays with archived RM-01. Unrelated orphan applications, scores, and interviews were not deleted.
- The already-deleted original RM-01 document cannot be fully recovered from remaining data. Its archive is explicitly marked recovered, with role/department and employee evidence. **All future deletions preserve the full position document.** Historical IDs with no surviving records cannot be inferred retrospectively.
- The repair is backed up locally in ignored `position-identity-backup-1789743651327.local`. The pre-repair live position and migration record are also stored in `positionIdentityRepairs/RM-01`. The repair was atomic after locking the affected position and is safe to rerun.
- Production verification compared every record in applications, scores, employees, interviews, notifications, validation logs, and candidate identities against the backup. No dependent record was deleted or changed beyond the planned positionId moves and employee snapshot.
- Validation: **180 unit tests passed across 23 files**, no pre-existing tests edited; archive/sequence emulator integration passed; migration emulator integration passed including an idempotent rerun; production build passed with the existing bundle-size warning.
- Firebase CLI stalled; rules were compiled and released through Firebase Rules API using the existing signed-in deployment account. Rules release: `7d5522e6-198d-4718-ae10-3a5bf6692380`. Scoring engine, calendar code, and candidate job detail page remain unchanged.

---

The following sections retain the original diagnosis and first implementation history.

# Position counts, identities, and deletion

## Diagnosis, reported before changing position lifecycle code

- Old document IDs came from `roleCode(title)`: strip non-ASCII alphanumeric characters from each word; for one word use its first four characters, otherwise use word initials capped at five characters; uppercase, with `EMP` as the fallback. Append a hyphen and a sequence padded to at least two digits.
- Creation searched only the browser's currently loaded `positions` for the largest matching sequence, added one, and used `setDoc`. There was no persistent counter or transaction. Deleting the largest ID permitted reuse; concurrent creators could overwrite the same ID.
- Deletion called `deleteDoc` on the position alone. Applications, scores, interview records, notifications, and validation logs were not removed. Existing rules prohibited deletion of scores, interviews, validation logs, notifications, and rejected applications.
- Hiring already copied employee profile data, `employeeRole`, and `employeeDept`, but also retained `positionId`. The Employees page required that position to exist and be visible, so the roster still depended on live position data.

## Headcount

Removed the only user-facing `N/M hired` display, in `src/pages/PositionDetail.jsx` (the staff position board). No change to `src/pages/JobDetail.jsx`.

Other field readers/writers remain intentionally unchanged:

- `src/components/OpenPositionModal.jsx`: carries forward an existing headcount when editing and defaults new positions to one, despite having no input control.
- `src/data/store.js`: maps/defaults headcount, stores it on creation/update, reads it during hiring, increments `hiredCount`, and automatically closes the vacancy when its target is reached. Mock mode does the same.
- `firestore.rules`: constrains staff updates to `hiredCount` and status; it does not read headcount itself.
- The two pre-existing untracked `scratch-ws8/audit-*.mjs` diagnostics print headcount. These were left untouched.

Thus removing the display does not remove the existing hire-triggered automatic closing behavior.

## Candidate counts

Before the change, position totals included both rejected applications and hired employee snapshots. Regional Manager was 5 (4 active applications plus 1 employee); Backend Dev was 7 (6 active plus 1 rejected).

All active totals now share `isActiveCandidate`: a populated stage other than Hired or Rejected, including configured intermediate stages.

| Surface | Change |
| --- | --- |
| Position board header | Both total and filtered-total denominator/numerator exclude terminal outcomes. |
| Positions page summary | Active applications only, within visible positions. |
| Position cards | Active counts, avatar stack/overflow, empty state, and progress use the same active set. |
| Candidates table | Already excluded Hired/Rejected; now uses the shared predicate. |
| Dashboard KPI and stage-mix total | Active candidates only; stage mix includes all observed active stages, including custom stages. |
| Dashboard department counts | Active candidates only. |

Historical hiring outcomes, rejected-list totals, employee counts, and application-volume history retain their distinct meanings. The position board's individual terminal-stage columns remain available. Dashboard scope includes all stored rows; position-scoped pages filter to visible positions, so existing orphaned active applications can still affect the global Dashboard until cleanup is approved.

## Identity and deletion fix

- New identities use `vacancy-v2-N`, a namespace disjoint from the legacy title codes. Existing IDs are not renamed.
- The permanent Firestore document `counters/positionsV2` stores the last issued sequence in `next`. A transaction increments it and creates the position together. The counter is never removed with a position.
- Rules prohibit resetting/deleting the counter, require increments of exactly one, and require every new position ID to match the newly claimed sequence. Old clients cannot create another title-derived ID under these rules. Concurrent stale claims are retried only after confirming another creator advanced the counter.
- Confirmation names the position and its persisted application count, states that applications/scores and associated interviews/notifications/validation logs will be removed, and states that hired employees are retained.
- Deletion first marks the position `deleting: true` and closes it. Rules block new dependent writes and prevent reopening the locked position. Cleanup runs in batches of 400 and deletes the position last. Failures leave a locked position that can be retried.
- Hires now also store a `hiredPosition` snapshot with title, department, creator, and stage assignments. Existing employees linked to a position receive missing snapshot fields before that position is deleted. Their IDs, profile, history, and copied job information survive. The retained `positionId` is historical provenance rather than a required live reference.
- HR's employee roster no longer requires a live position. Other viewers can use the saved assignment/creator snapshot. Existing employees whose positions were already deleted cannot have missing assignment information reconstructed automatically.
- Candidate identity/profile records are retained; only the position-specific application data is removed.

## Read-only production audit

Snapshot: 2026-09-18 13:52 UTC. All 11 current top-level collections were inspected. Full IDs are in `position-orphan-audit.json`; `scripts/audit-position-orphans.mjs` reproduces the read-only audit.

| Finding | Count | Records |
| --- | ---: | --- |
| Applications referencing missing positions | 2 | `9SdZNgZR0SXq5hAVCkuZ`, rejected, `HE-01`; `Po2HK2bC2gCJTw1uMa8c`, applied, `SFD-01`. |
| Scores referencing missing positions | 0 | None. |
| Scores with no surviving application | 1 | `EXuNpN6ZtokEglUxeQ48`, position `BD-01`. This may be historical; no deletion was inferred. |
| Employees with missing-position references | 2 | `SE-SNE-0001.positionId` → `SNE-01`; `SAL-RM-0037.fromPositionId` → `NE-01`. These employees must be retained. |
| Interviews referencing missing positions | 100 | 84 → `TEST-POS`, 16 → `X`. |
| Other missing-position references | 0 | None in candidate identities, notifications, validation logs, or the other inspected collections. |

`SAL-RM-0037.positionId` still references existing `RM-01`. A missing-reference audit cannot distinguish a valid link from a link reattached through ID reuse. No production records were changed, reassigned, or deleted.

## Verification and rollout

- Full suite: 179 tests passed across 22 files, including 5 new lifecycle/count tests. No pre-existing tests were adjusted.
- Firestore emulator integration: production persistence functions and current rules passed concurrent allocation, forbidden counter reset/deletion, unauthorized creation, 405 applications plus 405 scores across batches, rejected-application cleanup, late-write blocking, employee preservation, unrelated/orphan preservation, retry, and same-title recreation.
- The first concurrency check exposed stale counter claims surfacing as permission errors. The allocator was fixed; the unchanged integration scenario then passed.
- The installed Firebase CLI emulator launcher failed with its Java/runtime setup. A Java-17-compatible standalone Firestore emulator was used successfully instead.
- Production build passed; Vite reports the existing large-chunk warning.
- Scoring engine, calendar code, and candidate job detail page were not edited. Interview deletion permissions were changed only to support the requested associated-record cleanup.
- Application and Firestore rules deployed on 2026-09-18 at approximately 14:06 UTC after user authorization. Production URL: https://hyre-hiring.pages.dev; deployment: https://678d3c79.hyre-hiring.pages.dev. Production HTML and changed JavaScript bundles match the local build; the position route returns HTTP 200 and the unauthenticated API returns HTTP 401. Existing production orphan cleanup is still awaiting the user's decision; no data records were changed or deleted.
