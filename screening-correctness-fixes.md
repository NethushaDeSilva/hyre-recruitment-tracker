# Screening correctness fixes

The scoring formula, weights, calibrated thresholds, extraction model/prompt,
and historical calibration evidence are unchanged. Correcting a false Angular
match or restoring omitted embedding evidence can legitimately change affected
scores. These are documented corrections with a known blast radius: targeted
reassessment, not a blanket engineVersion bump or full rescore.

## Step 1: AngularJS normalization

Preserve AngularJS (including dotted, spaced, and numeric version variants)
before stripping generic JS suffixes. Angular and AngularJS no longer match;
Node.js/NodeJS and React/React.js retain their equivalence.

Baseline: 81 tests passed. Before the fix, six new AngularJS regression cases
failed; existing matching tests and Node/React regressions passed.

## Approved sequence

Step 5 authenticates only score-application/rescore-vacancy. Firebase RS256 ID
tokens are verified against Google's public keys, project issuer/audience,
expiry/issued-at/auth-time and subject; current Firestore user role must be HR,
Interviewer or Management. Missing/invalid credentials return 401, nonstaff 403,
and unavailable authorization services fail closed with 503. Origin checks remain.
validate-cv and parse-cv retain their existing candidate-accessible behavior.
No rate-limiting mechanism was found in those two handlers; none is claimed here.

jose 6.2.8 was already installed transitively and is now pinned as a direct runtime
dependency. Before client token wiring, clean commit e3290da passed 116 tests and
a production build; deployed preview 9fcfebe7 served /, /login, /positions,
/candidates, /jobs and its JS/CSS assets. These are HTTP smoke checks, not an
authenticated browser walkthrough. Production was not redeployed.

Four endpoint-auth regressions failed before wiring. Afterwards, the three batch
contract tests failed with 401 as expected and were given an authorized boundary
mock; signature and denial tests remain separate and exercise real cryptography.

Final verification: 131 tests pass in both the working tree and a clean checkout;
the clean checkout builds and the deployed Functions bundle compiles. Final
preview https://47e35494.hyre-hiring.pages.dev (alias
https://screening-correctness.hyre-hiring.pages.dev) serves the five page paths
and referenced assets. Both scoring endpoints return 401 without a token and
200 for a real, existing demo HR Firebase ID token. The authorized smoke requests
score a synthetic literal-only profile and perform no Firestore writes.
Candidate validation/parsing POSTs without credentials reach their normal
missing-text validation (400), not staff authorization. No production deployment,
historical-score migration, recalibration or bulk rescore was performed.

Known verification limits: no authenticated browser walkthrough or long-CV load
test against Workers AI was performed. Batch size 10 is the initial setting, not
a measured throughput guarantee. Retry snapshots are held in browser memory;
reloading starts a new run. Existing bundle-size warnings remain.

Step 4 adds eligibility independently of score arithmetic. Any known input or
output truncation forces needs_review. Missing/uncertain experience, unverified
skills and uncertain qualifications cannot establish eligibility; definite
experience deficits do not get compensated by a high numerical score. Required
degree level and field must belong to the same qualification. Eligibility and
correctness metadata have separate versions; ENGINE_VERSION stays 1.0.0.

Old scores remain visible. Missing eligibility is not numerical staleness.
Legacy results with a matching requirements snapshot can be assessed locally;
without sufficient provenance they require review, not a compulsory full rescore.
Old AngularJS and potentially truncated embedding assessments are flagged for
targeted reassessment. Bulk progression requires threshold plus meets status;
individual human overrides remain distinct from an eligibility decision.

The sole existing test failure in step 4 was the exact metadata-object assertion,
which required the two new metadata fields. Numerical assertions were unchanged.

Step 3 rejects oversized requests (413 with every ID outstanding), validates
unique IDs, and returns exact reconciliation. Normal rescore is Applied-only.
The client uses RESCORE_BATCH_SIZE=10, one in-flight request, acknowledged writes
before the next batch, and bounded retries retaining the original requirements
and profiles. A transaction refuses to overwrite a later-stage assessment or
save an obsolete requirements snapshot as fresh. In-memory retry state survives
another Retry click, not a browser reload; after reload a new run is explicit.
Three new endpoint regressions failed before the fix; batching tests verify
save acknowledgment, retry snapshots, duplicate responses, and partial failure.

Step 2 implements sequential 100-text embedding chunks, exact count validation,
and positional vector truncation metadata carried through cached verification
into the assessment's inputTruncated flag. The HTTP embedding route serializes
truncated indexes separately, preserving its numeric embeddings contract.
Extraction array caps now return outputCapped/outputCappedFields. Step 4 connects
these flags to eligibility and persists extraction quality on candidate profiles.
Before the embedding fix, all four new completeness/metadata regressions failed.

1. AngularJS normalization and regressions.
2. Ordered embedding chunks, count validation, nonfatal truncation flags.
3. Applied-only batches and reconciliation; count saves after acknowledgment.
4. Eligibility data, legacy assessment handling, minimal UI and bulk gate.
5. Staff-only scoring endpoint authentication, isolated and last.

Candidate validation/extraction remain candidate-accessible. Length limits are
nonfatal, visible uncertainty; they are never grounds for rejecting a CV.
