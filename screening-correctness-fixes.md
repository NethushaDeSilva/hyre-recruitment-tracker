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

1. AngularJS normalization and regressions.
2. Ordered embedding chunks, count validation, nonfatal truncation flags.
3. Applied-only batches and reconciliation; count saves after acknowledgment.
4. Eligibility data, legacy assessment handling, minimal UI and bulk gate.
5. Staff-only scoring endpoint authentication, isolated and last.

Candidate validation/extraction remain candidate-accessible. Length limits are
nonfatal, visible uncertainty; they are never grounds for rejecting a CV.
