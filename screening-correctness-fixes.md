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
