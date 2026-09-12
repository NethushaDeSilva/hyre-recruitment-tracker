# WS6 — Calibration and Test Evidence — Results

Run 2026-09-12 against the live deployed pipeline (`https://hyre-hiring.pages.dev`), real Cloudflare Workers AI calls throughout, zero Firestore writes (every scoring/parsing call below goes through the real `/api/parse-cv`, `/api/validate-cv`, `/api/embed` endpoints and the real `scoreApplication()`/`verifyTerm()` functions directly — no application, candidate or score document was ever created in Firestore for this evidence run). Extended the same day to close two gaps the first pass flagged (a near-threshold fixture, 08, and a hallucination-control fixture, 09), then extended again to fix a methodology defect found while building fixture 08: `SKILL_SIMILARITY_THRESHOLD` was set by a hard-negative pair layer 3 never actually evaluates (6.1). Audited, fixed at the source, re-run, and every score in this document re-confirmed against the corrected value. Raw data backing every number in this document is committed alongside it: `ws6-batch1-results.json` (fixtures 01–07 single-pass sanity run), `ws6-variance-runs.json` (80 raw runs, fixtures 01–08 × 10), `ws6-analysis.json` (derived stats), `ws6-hallucination-results.json` (fixture 09's `verifyTerm()` results), `ws6-reclassified-threshold.json` (every layer-3 skill comparison under both the original and corrected threshold), `calibration-pairs/calibration-results-v3-layer1-uncorrected.md`/`.json` (the pre-correction round, kept as evidence per this project's own before/after convention).

Reference vacancy used for every fixture (BD-01's real, live requirements):
```
requiredQualification: { level: 6, field: "Computer Science" }
requiredSkills: [Node.js, Docker, PostgreSQL, Redis, Kubernetes, MongoDB]
minYearsExperience: 8
niceToHave: [Terraform, GraphQL]
```

---

## 6.1 — Threshold calibration

Full pair tables and methodology: [`calibration-pairs/calibration-results.md`](calibration-pairs/calibration-results.md) (current, corrected round — v1/v2/v3 kept alongside as the before-and-after evidence trail).

### A fourth correction, found while building fixture 08

While searching for a near-threshold pair (6.4), the pair that *sets* `SKILL_SIMILARITY_THRESHOLD` — `Angular`/`AngularJS` — turned out to be **unreachable by layer 3 in the live engine**. `normalizeTerm()` (layer 1, 5.4) strips a trailing `.js`/`js` suffix so `Node.js`/`NodeJS` normalize identically; that same rule also strips `AngularJS` → `angular`, which then exact-matches the normalized `Angular` **at layer 1**. Layer 3 — and the threshold governing it — never sees that pair live. Using its measured similarity (0.8804) to set the threshold pinned it to a case the pipeline never actually evaluates. **A methodology error, not a footnote** — the threshold that gates every real layer-3 comparison was calibrated against a comparison layer 3 doesn't make.

**Audited the full hard-negative set for the same defect** (`scripts/ws6-audit-layer1-collapse.mjs` — runs the real `normalizeTerm()` against both sides of every hard-negative pair in both calibration sets):

| Set | Hard negatives | Collapsed at layer 1 | Which |
|---|---|---|---|
| Skills (15 pairs) | 15 | **1** | `Angular`/`AngularJS` only |
| Qualifications (15 pairs) | 15 | **0** | none — `Electrical Engineering`/`Electronic Engineering` (fixture 08's pair) is unaffected |

**Fixed at the source, not patched after the fact.** `scripts/calibrate-thresholds.mjs` now excludes any hard-negative pair where `normalizeTerm(a) === normalizeTerm(b)` from threshold derivation (kept visible in the results table, marked excluded, never deleted — same evidentiary discipline as v1/v2's contaminated pairs). Re-ran it for real: fresh embeddings, not reused numbers.

| | Original threshold | Corrected threshold | Δ | New binding pair |
|---|---|---|---|---|
| **Skills (PRIMARY)** | 0.8804 (`Angular`/`AngularJS`, unreachable) | **0.8099** | **−0.0705** | `MySQL`/`PostgreSQL` (0.8099) |
| **Qualifications** | 0.8782 | **0.8782** | 0.0000 | unchanged — `Electrical Engineering`/`Electronic Engineering` was always reachable |

`SKILL_SIMILARITY_THRESHOLD` moved substantially — down 0.0705, a real, material correction, exactly the kind the audit was run to catch. **The 100% false-negative rate on true_match is unchanged at the corrected threshold** (true_match max is 0.8046, still below 0.8099) — the headline WS6.1 finding is not an artifact of the invalid pair, it survives the correction. One secondary-set nuance did change: 2 of 15 phrase-vs-keyword pairs (`Writing automated test suites`/`Test automation` at 0.8727, `Optimizing SQL query performance`/`Database performance tuning` at 0.8481) now clear the corrected primary threshold, versus 0 before — informational only, doesn't set the threshold, but worth recording since it's a real, new data point.

`calibrated-thresholds.generated.js` has been regenerated with the corrected value and is what every fixture in this document (re-confirmed live below) is now scored against — not the invalid 0.8804.

| | Derived threshold | true_match range | hard_negative range (reachable only) | False-negative rate at threshold |
|---|---|---|---|---|
| **Skills (PRIMARY)** | **0.8099** (= max reachable hard-negative, `MySQL`/`PostgreSQL`) | 0.5910–0.8046 (n=15) | 0.5432–0.8099 (n=14, `Angular`/`AngularJS` excluded) | **100%** (15/15) |
| **Qualifications** | **0.8782** (= max hard-negative, `Electrical Engineering`/`Electronic Engineering`) | 0.7223–0.8760 (n=15) | 0.6389–0.8782 (n=15) | **100%** (15/15) |

Both are live in production (`functions/_lib/filtration/calibrated-thresholds.generated.js`) — every score in this document was re-confirmed against these exact, corrected numbers (`scripts/ws6-reclassify-corrected-threshold.mjs` and a direct live re-run of fixtures 03 and 08 both reproduce their original scores unchanged — see 5.4 for the full reclassification).

---

## 6.2 — Ground-truth bands and fixture results

Band = hand-derived ground truth ± 5 points, using 5.3's formulas exactly, derived **before** any fixture was run. One band was wrong on first derivation — kept visible below rather than quietly fixed, per 6.2's own rule to diagnose rather than accommodate.

| # | Fixture | Ground truth (as originally stated) | Measured | Verdict |
|---|---|---|---|---|
| 01 | strong-match | 100 [95–100] | **100** | ✅ in band |
| 02 | keyword-stuffed | ~~22 [17–27]~~ **corrected: 80 [75–85]** | **80** | ⚠️ see below |
| 03 | different-vocabulary | 20 [15–25] | **20** | ✅ in band, exact |
| 04 | career-changer | 95 [90–100] | **95** | ✅ in band, exact |
| 05 | non-computing-degree | 75 [70–80] | **75** | ✅ in band, exact |
| 06 | academic-long (19,067 chars) | 100 [95–100] | **100** | ✅ in band |
| 07 | no-headings-long (18,182 chars) | 88 [83–93] | **88** | ✅ in band, exact |

**Fixture 02 diagnosis.** The band I originally reported (17–27, ground truth 22) assumed a candidate with *no education section at all* — but the fixture file I actually wrote gives her a real, exact-matching degree (`BSc (Hons) Computer Science`). I'd recomputed the score by hand for that revised design at the time (25 qual + 45 skills + 0 experience + 10 nice-to-have = 80, no cap since level is met) but reported the stale, pre-revision number in the table shown to you. This is a bookkeeping error in my own derivation, not a system defect: recomputing from 5.3's formulas against the fixture as actually written gives 80, and the real measured score is 80 — exact. Corrected band: **[75, 85]**.

**Fixtures 03 and 07 are worth reading closely, not just checking off:**
- **03** was the one fixture I flagged as a genuine prediction rather than a near-certainty. All 6 required skills + both nice-to-haves were paraphrased (e.g. "container orchestration" for Kubernetes — a pair already measured live earlier this session at 0.7276 against the 0.8804 threshold). Real extraction only pulled 2 discrete skill tokens out of the narrative prose (`container orchestration`, `infrastructure-as-code`) — the model didn't reliably promote paraphrased capabilities embedded in flowing prose to `skills[]` the way it does for an explicit bullet list. All 9 comparisons (6 core + 2 nice-to-have + 1 qualification field) fell through to layer 3 and **none** cleared threshold — score landed at exactly the predicted 20. Real, live confirmation of the WS6.1 finding hitting a realistic (if adversarially designed) CV, plus a second, distinct finding: narrative-prose CVs extract fewer discrete skills than list-format ones, compounding the embedding-layer limitation.
- **07** deliberately dropped MongoDB and Terraform to exercise the 5.3 round-half-up rule (`45 × 5/6 = 37.5 → 38`) documented earlier this session. Measured core-skills score: 38. Confirmed on real data, not just the abstract example.

---

## 6.3 — Fixture set and failure fixtures

All in `test-fixtures/cvs/`. F1/F2 are text fixtures (they test the length/content gate, not PDF parsing); F3/F4/F5 are real binary files, each verified through the actual client code path via a real headless browser against the live app (never a raw fetch — `extractPdfText()` and the WS3 UI states are browser-only code, so a faithful test has to actually run in one).

| # | Input | Expected | Measured |
|---|---|---|---|
| F1 | Random non-CV doc (sprint planning notes, 1,063 chars) | `isCv:false`, no score, blocked | **`isCv:false`, confidence 0**, reason: *"appears to be team meeting notes, not a personal CV"* — real Worker call, correct verdict |
| F2 | Blank (18 chars) | Rejected at Red band, 0 Neurons | **Blocked locally** (`too-short`) before any Worker call — confirmed 0 Neurons spent |
| F3 | Image-only scanned PDF (built with `pdf-lib`, zero embedded text) | Explicit extraction error, never a silent pass | **"This looks like a scanned or image-only PDF with no readable text"** — exact `stage: "image-only"` message, real browser `pdfjs-dist` run |
| F4 | Corrupt PDF (valid PDF truncated to 40% of its bytes, breaking the xref table) | Readable message | **"We couldn't check your CV right now — this is on our end, not your file" + Try again.** See note below — this is the `errored` path, not `blocked` |
| F5 | Worker URL made unreachable (`/api/validate-cv` intercepted and aborted mid-request) | Error state with retry, never a rejection, never a silent pass | **Exact same error state as F4**, Submit confirmed disabled throughout. Un-intercepting and clicking "Try again" **recovered correctly** — scan completed, Submit re-enabled. Full retry loop verified live, not assumed. |

**F4 finding, stated precisely rather than smoothed over:** the app's own design (`cv-extract.js`) deliberately routes an unparseable PDF to the same "our problem, not yours" error state as a genuinely dead Worker — the comment there reads *"Couldn't parse it in a way we can name specifically — treat as OUR problem, not a verdict on their file."* That's a defensible call (a bad upload could be a transient browser/network glitch), but it means F4 and F5 are currently **indistinguishable to the candidate** even though only one of them is fixable by clicking "Try again" — a truly corrupt file will fail identically forever. Not a bug against the spec (which only asks for "a readable message," which this is), but worth a product decision at some point: either leave it as intentionally conservative, or add a distinct message for the small number of retries that fail identically twice in a row.

Screenshots for F3/F4/F5 (including the live recovery after F5) were captured during this run and are available on request — not committed here to keep the repo lean, since they're a byproduct of the run, not a fixture.

---

## 6.4 — Stability

**Scoring-stage variance: σ = 0.00.** Already proven by the existing unit test (`functions/_lib/filtration/engine.test.js`) feeding one static `CandidateProfile` through the scoring engine 100 times — a mathematical certainty for pure functions, unchanged by this run.

**End-to-end variance: measured, not predicted — σ = 0.00 across all 8 fixtures, 10 runs each (80 total, real parse-cv + real scoring).**

| Fixture | Scores across 10 runs | σ |
|---|---|---|
| 01 | 100 ×10 | 0.0000 |
| 02 | 80 ×10 | 0.0000 |
| 03 | 20 ×10 | 0.0000 |
| 04 | 95 ×10 | 0.0000 |
| 05 | 75 ×10 | 0.0000 |
| 06 | 100 ×10 | 0.0000 |
| 07 | 88 ×10 | 0.0000 |
| **08** | **75 ×10** | **0.0000** |

Fixture 08 is new — built specifically to close the gap the original run flagged (below). Two things the original 7-fixture result genuinely wasn't:

1. **Not a claim that end-to-end determinism holds in general** — still true, unchanged.
2. **Not evidence the documented embedding non-reproducibility (0.8701→0.8782 threshold drift on an identical qualifications pair set, WS6.1) has gone away** — the original 7 fixtures had zero comparisons anywhere near the threshold (closest miss was 0.15+ away). Fixture 08 fixes exactly that gap; see below.

**Fixture 08 — the deliberately near-threshold fixture.** A systematic search across 34 candidate skill-pair phrasings (Docker/Podman, Kubernetes/OpenShift, MongoDB/DynamoDB, PostgreSQL/MySQL, and 30 others, all measured live against the real `/api/embed` endpoint) found nothing closer than **Δ0.065** from `SKILL_SIMILARITY_THRESHOLD`. The single closest real, non-contrived candidate in the whole project turned out to be a **qualification** pair, not a skill pair: `"Electrical Engineering"` / `"Electronic Engineering"` — the exact hard-negative pair that *sets* `QUAL_SIMILARITY_THRESHOLD` (0.8782373...), with real historical evidence (WS6.1) of measuring 0.8701 in one calibration round and 0.8782/0.8804 in another — genuine, documented cross-session drift on an unchanged pair.

Fixture 08 is a career-changer CV: BSc (Hons) **Electrical Engineering**, applying (via a purpose-built requirements object, not BD-01's live posting) to a role requiring **Electronic Engineering** at the same degree level, with all 6 core skills and both nice-to-have skills stated verbatim and 10+ years of experience against an 8-year minimum — every other scoring component deliberately clean, so the qualification-field comparison is the *only* variable term.

Ground truth, hand-derived **before** running (6.2), deliberately bimodal rather than a single point — that's the test itself:
```
Field does NOT clear the threshold (the then-current measured state): 0 + 45 + 20 + 10 = 75/100
Field DOES clear (the flip case)                                    : 25 + 45 + 20 + 10 = 100/100
```

Measured, 10 runs, real wall-clock spacing (2.3–3.6s apart, sequential, not pooled — a real full `parse-cv` + `score` round trip each time, not a tight burst):

```
run 0-9: score=75  qual=0/25  rawFieldSimilarity=0.865785  (identical, bit-for-bit, all 10 runs)
```

`0.865785` sits **0.012452 below** the live threshold (0.878237) — closer than anything else measured this session, but, precisely stated, **0.0025 outside** the engine's own `BORDERLINE_BAND` (0.01, `matching.js`). The raw similarity was invisible through the engine's own output on every non-match (`qualificationScore()`'s `fieldSimilarity` is `null` on a miss — HR never sees *how close* a rejected qualification was, only that it was rejected) — captured here by instrumenting the `embedTexts` call the engine itself makes, not by changing engine behaviour.

**Result: even the closest real, non-contrived near-threshold comparison available in this project did not flip across 10 independently-executed real API calls.** This is a genuine null result, not an untested claim — see the closing synthesis under 5.4 for what it does and doesn't mean for that decision.

---

## 6.5 — Rank stability

Treating run-index *i* across all 8 fixtures as "round *i*" (10 rounds), ranked by 5.8's exact rule (overallScore desc, then core-skills score desc, ties shared):

| Rank | Fixture(s) | Score |
|---|---|---|
| 1 (tied) | 01, 06 | 100 |
| 3 | 04 | 95 |
| 4 | 07 | 88 |
| 5 | 02 | 80 |
| 6 (tied) | **05, 08** | 75 |
| 8 | 03 | 20 |

- **Per-fixture rank standard deviation: 0.0000 for all 8** — identical every round, including the new fixture 08.
- **05 and 08 land on the exact same rank (tied)** — both score 75/100 with identical core-skills (45/45), for completely different reasons (05: non-computing degree; 08: near-threshold field mismatch) — 5.8's tie-handling correctly treats "same score, same core-skills" as a tie regardless of why, without inventing an ordering between them.
- **Spearman's ρ = 1.0000** (round 0 vs. every other round, now n=8).

Targets (ranks 1–3 identical, 4–10 within ±1, ρ ≥ 0.85) are met — and this time the result carries more weight than the original run's, because fixture 08 was purpose-built to be the hardest real case available for rank stability to fail on, and it didn't. **Still not proof that NO near-threshold comparison can ever flip a rank** — WS6.1's own cross-session measurement (0.8701→0.8782) is real, separate evidence that drift does happen at the calibration-pair level, just not within this fixture, within this test window. See 5.4 below.

---

## 6.6 — Heuristic catch rate

```
Local catch rate = Red-zone rejections / total junk fixtures submitted = 1 / 2 = 50%
```

Reported as measured, no target set in advance, per 6.6's own rule. The one junk fixture the local heuristic *didn't* catch (F1) wasn't a heuristic failure — it's within the normal 200–20,000 character range with no obvious markers of junk, so it's correctly designed to escalate to the Worker's AI judgment, which then correctly rejected it (`isCv:false`, confidence 0). The heuristic gate's job is cheap **local** rejection, not the whole classification — 50% of junk caught for free (0 Neurons) before ever reaching the model is the real, current number for this project's actual two-outcome gate (5.9's Red/Yellow/Green three-band design isn't built yet — see CLAUDE.md 5.9's own "Implementation status" note).

---

## 5.4 — Embedding layer firing rate (the open decision's evidence)

**Everything below was originally measured against `SKILL_SIMILARITY_THRESHOLD = 0.8804` — since corrected to 0.8099 (6.1: that value was set by a hard-negative pair layer 3 never actually evaluates). Re-measured against the corrected threshold before reporting — see the reclassification below. The bottom-line numbers below are unchanged by the correction, and that fact is itself part of the evidence, not assumed.**

Aggregated across all 80 real runs (fixtures 01–07: 63 comparisons/pass × 10 rounds; fixture 08 adds 1 qualification-field comparison × 10 rounds = 720 total), as originally classified:

| | Count | % of all comparisons |
|---|---|---|
| Resolved at layer 1/2 (normalisation, free) | 580 | 80.6% |
| Reached layer 3 (embedding attempted) | 140 | 19.4% |
| — of those, credited (match found) | **0** | **0.0%** of layer-3 attempts |
| — of those, no match | 140 | 100.0% of layer-3 attempts |
| Borderline (within 0.01 of threshold) | **0** | 0.0% of all comparisons |

**Reclassification against the corrected threshold** (`scripts/ws6-reclassify-corrected-threshold.mjs`): every real layer-3 skill comparison from fixtures 01–07 was re-derived from the actually-extracted `skills[]` for each fixture, with a fresh real `/api/embed` call, and classified against both the old (0.8804) and corrected (0.8099) threshold side by side.

```
Total layer-3 skill comparisons (fixtures 01-07, single real pass each): 11
Comparisons that flip from "missing" to "matched" under the corrected threshold: 0
Closest: "Docker" vs extracted "container orchestration" (fixture 03) = 0.7302 -- still 0.0797 short of 0.8099
```

Fixture 08's qualification-field comparison uses `QUAL_SIMILARITY_THRESHOLD`, which the audit (6.1) found **was not affected** by the layer-1-collapse defect — its result (0.865785, Δ0.0125 below threshold, stable across 10 runs) stands as originally reported. Fixture 09's six `inferred`-attempt similarities were also reclassified against the corrected skill threshold: none flip, though the closest (`relational database`, 0.8069) now sits only **0.0030** below the corrected threshold — the single closest miss anywhere in this entire evidence set, corrected or not.

**Directly re-confirmed, not just recalculated:** fixtures 03 and 08 were re-run live, once each, through the real engine with the corrected threshold now actually loaded (`calibrated-thresholds.generated.js` was regenerated, 6.1) — both reproduced their original scores exactly (03 → 20, 08 → 75). The correction changes the number that governs the decision below; it does not change any score this document has reported.

**Closing synthesis, now on the correct threshold.** Four independent lines of evidence point the same direction:
1. **Firing-rate evidence**: non-trivial firing (19.4%), zero credited matches, zero borderline, across 140 real attempts — reclassified against the corrected threshold, still zero flips.
2. **The single real production data point** recorded earlier this session (`Container orchestration`/`Kubernetes`, 0.7276 — 0.0823 below even the corrected 0.8099).
3. **Fixture 08**: the closest real near-threshold pair available in the project (Δ0.0125 under the corrected qualifications threshold, which the correction didn't change) — did not flip across 10 real calls.
4. **Fixture 09's inferred attempts**: six real attempts, closest miss now Δ0.0030 under the corrected threshold — the nearest of any measurement in this document, and still a miss.

None of this proves the documented cross-session drift (0.8701→0.8782, qualifications) can never flip a score — that remains real, separate, measured evidence. What it shows: across every real attempt made this session, under both the flawed and the corrected threshold, none crossed. Per 5.4's own decision rule (*"near-zero firing means remove it, a non-trivial BORDERLINE count means the instability is real"*): firing is non-trivial, borderline is genuinely, repeatedly zero — now measured against the right number. This is the fullest evidence base fixture-level testing can give; the decision itself stays yours.

---

## Unverifiable-terms log (5.6/5.8) — and a positive finding about extraction

Every matched skill and every matched qualification across fixtures 01–08 came back `status: "verified"` — the mechanism itself was never exercised at `inferred` or `unverifiable` by those 8, because every fixture either states a skill literally (verified) or omits it entirely (missing) — never implies-without-stating. Fixture 09 closes that gap, and produces a genuinely positive result along the way.

**Fixture 09** (`09-hallucination-test.txt`): a CV using CLAUDE.md's own illustrative example almost verbatim — *"Built and maintained RESTful APIs in Express..."*, never writing "Node.js" anywhere — plus a deliberately vague, buzzword-heavy summary line (*"comfortable across the full modern data platform, from event-driven pipelines to graph-shaped data"*) baiting extraction toward inventing Kafka/Neo4j/GraphQL-type claims with zero real support behind them.

**The finding, stated as what it is: a positive result about hallucination resistance, not a gap.** Run through the real, deployed `/api/parse-cv` endpoint, extraction did **not** take the bait. `skills[]` came back as exactly `[Express, PostgreSQL, Redis, REST APIs, JavaScript, Git, Jest]` — only what's literally stated. Neither the Express→Node.js implication CLAUDE.md names as the expected case, nor any of the buzzword-bait technologies, made it into the parsed profile. This is exactly the behaviour 5.6's whole design exists to protect ("never invent data... a hallucinated qualification is a hiring liability, not a rounding error") — measured directly against a CV built specifically to tempt the model into failing that standard, and it didn't. **Deliberately adversarial input, model held the line, evidenced not assumed.**

**The caveat this finding carries, stated plainly:** because extraction doesn't over-claim, the full extraction→matching→verification chain has nothing ungrounded to hand `verifyTerm()` in ordinary operation — which means **the `inferred` path (5.6) remains unexercised end-to-end in production**, not because the control is unproven, but because the upstream behaviour it exists to catch essentially doesn't occur. That's worth knowing precisely, not smoothing into "everything's fine": if extraction quality ever regresses, `inferred`/`unverifiable` are the safety net, and this fixture is evidence the net has real, working rope (below), even though nothing has fallen into it yet.

**So `verifyTerm()` — the actual 5.6 control — was tested directly**, against real embeddings and this fixture's real extracted text, on terms a matching pass *would* hand it if extraction ever over-claimed this way. Reclassified against the corrected `SKILL_SIMILARITY_THRESHOLD` (0.8099, see 6.1) rather than the original invalid 0.8804:

| Term | Why chosen | Status | Confidence | vs. corrected threshold (0.8099) |
|---|---|---|---|---|
| `PostgreSQL` | Control — literally stated | **verified** | 1.0000 | — |
| `Node.js` | CLAUDE.md's own example — implied by the Express/REST-API sentence | **unverifiable** | 0.6826 | 0.1273 short |
| `Kubernetes` | No container/orchestration context anywhere — true negative | **unverifiable** | 0.6257 | 0.1842 short |
| `backend web framework` | 2nd inferred attempt | **unverifiable** | 0.7868 | 0.0231 short |
| `relational database` | 3rd inferred attempt — implied by the PostgreSQL sentence | **unverifiable** | 0.8069 | **0.0030 short — closest miss in this entire document** |
| `API testing` | 4th inferred attempt — implied by "unit and integration tests" | **unverifiable** | 0.6976 | 0.1123 short |
| `asynchronous JavaScript` | 5th inferred attempt — CV literally says "use async/await throughout" | **unverifiable** | 0.7377 | 0.0722 short |

**Two of the three states are real, measured observations, not assumptions: `verified` and `unverifiable` both fired correctly** — verified on the literal control; unverifiable correctly on a true negative with zero context, and — six separate times, against real embeddings — on genuinely well-implied but unstated terms, never crediting a claim the CV doesn't actually support. `inferred` did not fire in six attempts including CLAUDE.md's own named example, and stayed unfired even under the corrected, lower threshold — though `relational database` came within 0.0030 of it, the single nearest miss anywhere in this document. `inferred` is real, unit-tested code (`verification.test.js`); this evidence says it's rarely if ever reached in production because extraction doesn't hand it ungrounded claims to check, not because the check itself is broken.

---

## Role-based access (6.7)

Re-run against live Firestore rules via the real client SDK, immediately before this document was assembled:

```
10/10 passed — R1, R2, R3, R4a, R4b, R4c, R5, R6, R6-sanity, R7
```

Full output: `scripts/verify-rules-r1-r6.mjs`.

---

## What this run does and doesn't prove

**Proves, with real evidence, not assumption:**
- The scoring formulas in 5.3 are implemented exactly as specified — 7 of 8 fixtures matched hand-derivation on the first try; fixture 02 caught a real error in my own derivation, not the engine's.
- **Extraction resists hallucination under deliberately adversarial input** (fixture 09) — a CV built specifically to tempt the model into inventing "Node.js" from Express context, and buzzword-baiting several more, produced zero invented skills. A genuinely positive result, not a gap.
- `SKILL_SIMILARITY_THRESHOLD` was miscalibrated by a pair layer 3 can't evaluate (6.1) — found, audited across the full hard-negative set (1/15 affected), fixed at the source (`scripts/calibrate-thresholds.mjs`), and re-confirmed live: every fixture score in this document is unchanged under the corrected value.
- The WS6.1 calibration finding (short technical terms defeat this embedding model) reproduces on realistic CVs, not just calibration pairs — and now also on the single closest real near-threshold case available (fixture 08), on six real grounding-credit attempts (fixture 09), and survives the threshold correction itself (still 100% false-negative on true_match at 0.8099) — four independent confirmations.
- Rank stability and end-to-end score stability hold against the hardest real near-threshold case this project could produce (fixture 08, 10 runs, real wall-clock spacing, corrected threshold) — not a general proof of determinism (see below), but no longer an untested claim either.
- `verifyTerm()`'s `verified` and `unverifiable` states both fire correctly on real data, including under adversarial CV phrasing designed to trip them.
- 5.9's head-tail truncation fallback correctly preserves scorable content on two structurally different long-CV shapes (19k and 18k chars).
- WS3's failure states (image-only, corrupt, dead-Worker) all produce the required non-silent, non-blaming behavior, verified in a real browser against the real production app, including a full outage→retry→recovery cycle.
- R1–R7 access control holds.

**Does not prove, and shouldn't be read as proving:**
- General end-to-end determinism, or that NO near-threshold comparison can ever flip a score — fixture 08 is one real case, not exhaustive, and WS6.1's own cross-session drift (0.8701→0.8782) remains real, separate, unresolved evidence that flips can happen between sessions even though this one didn't.
- That the layer-1-collapse audit found every possible calibration defect — it checked hard negatives (the pairs that set the threshold) specifically, not every pair in every set, because that's the class of defect that actually changes runtime behaviour.
- `inferred` firing on any real CV in production — extraction not over-claiming (a good result) is also the reason `inferred` stays unexercised end-to-end; the mechanism is proven correct on real embeddings, its real-world trigger rate is a separate, open question.
- Coverage of F4 as password-protected specifically — **still an open gap, stated plainly, not silently dropped**: F4 here is a corrupt/truncated file, not an encrypted one. No library in this project's toolchain (`pdf-lib`, confirmed) writes encrypted PDFs, and building real PDF encryption by hand was judged too large a side-task for this evidence round. Deferred, with the reason on record, same as CLAUDE.md 6.3's own framing of it.
