# WS6 — Calibration and Test Evidence — Results

Run 2026-09-12 against the live deployed pipeline (`https://hyre-hiring.pages.dev`), real Cloudflare Workers AI calls throughout, zero Firestore writes (every scoring/parsing call below goes through the real `/api/parse-cv`, `/api/validate-cv`, `/api/embed` endpoints and the real `scoreApplication()` engine directly — no application, candidate or score document was ever created in Firestore for this evidence run). Raw data backing every number in this document is committed alongside it: `ws6-batch1-results.json` (single-pass sanity run), `ws6-variance-runs.json` (70 raw runs), `ws6-analysis.json` (derived stats).

Reference vacancy used for every fixture (BD-01's real, live requirements):
```
requiredQualification: { level: 6, field: "Computer Science" }
requiredSkills: [Node.js, Docker, PostgreSQL, Redis, Kubernetes, MongoDB]
minYearsExperience: 8
niceToHave: [Terraform, GraphQL]
```

---

## 6.1 — Threshold calibration

Full pair tables and methodology: [`calibration-pairs/calibration-results.md`](calibration-pairs/calibration-results.md) (current, corrected round — v1/v2 kept alongside as the before-and-after evidence trail). Summary:

| | Derived threshold | true_match range | hard_negative range | False-negative rate at threshold |
|---|---|---|---|---|
| **Skills (PRIMARY)** | **0.8804** (= max hard-negative, `Angular`/`AngularJS`) | 0.5910–0.8046 (n=15) | 0.5432–0.8804 (n=15) | **100%** (15/15) |
| **Qualifications** | **0.8782** (= max hard-negative, `Electrical Engineering`/`Electronic Engineering`) | 0.7223–0.8760 (n=15) | 0.6389–0.8782 (n=15) | **100%** (15/15) |

Both are live in production (`functions/_lib/filtration/calibrated-thresholds.generated.js`) — every score below was computed against these exact numbers, not a placeholder.

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

**End-to-end variance: measured, not predicted — σ = 0.00 across all 7 fixtures, 10 runs each (70 total, real parse-cv + real scoring).**

| Fixture | Scores across 10 runs | σ |
|---|---|---|
| 01 | 100 ×10 | 0.0000 |
| 02 | 80 ×10 | 0.0000 |
| 03 | 20 ×10 | 0.0000 |
| 04 | 95 ×10 | 0.0000 |
| 05 | 75 ×10 | 0.0000 |
| 06 | 100 ×10 | 0.0000 |
| 07 | 88 ×10 | 0.0000 |

Two things this genuinely is not:

1. **Not a claim that end-to-end determinism holds in general.** CLAUDE.md is explicit that it shouldn't be claimed, and this run doesn't contradict that — see below.
2. **Not evidence the 6.4-documented embedding non-reproducibility (0.8701→0.8782 threshold drift on an identical pair set) has gone away.** The `borderline` count across all 630 comparisons in this run was **0** (below). Embedding non-reproducibility can only flip a score when some comparison sits close enough to the threshold for a small run-to-run drift to cross it — and in this fixture set, nothing ever got close. The 13 comparisons that did reach layer 3 (fixture 03's paraphrased terms) missed by 0.15–0.26, not by a hair. **A real σ=0.00, for a documented reason, not an accidental one.**

**Also confirmed via `wrangler.toml`:** this project has no AI Gateway configured — only a direct `[ai]` binding. There is no cache to bypass; every `parse-cv`/`embed` call in this run was already a fresh, uncached inference. CLAUDE.md's "cache bypassed" instruction presumes infrastructure that was never actually provisioned — noted here as a factual correction to the spec's phrasing, not something that changed how this run was conducted (it couldn't have been cached either way).

---

## 6.5 — Rank stability

Treating run-index *i* across all 7 fixtures as "round *i*" (10 rounds), ranked by 5.8's exact rule (overallScore desc, then core-skills score desc, ties shared):

| Rank | Fixture(s) | Score |
|---|---|---|
| 1 (tied) | 01, 06 | 100 |
| 3 | 04 | 95 |
| 4 | 07 | 88 |
| 5 | 02 | 80 |
| 6 | 05 | 75 |
| 7 | 03 | 20 |

- **Per-fixture rank standard deviation: 0.0000 for all 7** — identical every round.
- **01 and 06 land on the exact same rank (tied), not an invented ordering** — both scored 100 with identical core-skills (45/45) every round. This is 5.8's tie-handling working exactly as specified, on real data, not a constructed example.
- **Spearman's ρ = 1.0000** (round 0 vs. every other round).

Targets (ranks 1–3 identical, 4–10 within ±1, ρ ≥ 0.85) are trivially and fully met — but honestly, this is a direct consequence of §6.4's σ=0.00: with zero underlying score variance, rank stability was never actually stress-tested here. A fixture set with at least one comparison sitting genuinely near the calibration threshold (deliberately absent from this set) would be a stronger test of rank stability specifically, and is a natural next addition rather than something this run can claim to have covered.

---

## 6.6 — Heuristic catch rate

```
Local catch rate = Red-zone rejections / total junk fixtures submitted = 1 / 2 = 50%
```

Reported as measured, no target set in advance, per 6.6's own rule. The one junk fixture the local heuristic *didn't* catch (F1) wasn't a heuristic failure — it's within the normal 200–20,000 character range with no obvious markers of junk, so it's correctly designed to escalate to the Worker's AI judgment, which then correctly rejected it (`isCv:false`, confidence 0). The heuristic gate's job is cheap **local** rejection, not the whole classification — 50% of junk caught for free (0 Neurons) before ever reaching the model is the real, current number for this project's actual two-outcome gate (5.9's Red/Yellow/Green three-band design isn't built yet — see CLAUDE.md 5.9's own "Implementation status" note).

---

## 5.4 — Embedding layer firing rate (the open decision's evidence)

Aggregated across all 70 real runs (63 comparisons per pass × 10 rounds = 630 total):

| | Count | % of all comparisons |
|---|---|---|
| Resolved at layer 1/2 (normalisation, free) | 500 | 79.4% |
| Reached layer 3 (embedding attempted) | 130 | 20.6% |
| — of those, credited (match found) | **0** | **0.0%** of layer-3 attempts |
| — of those, no match | 130 | 100.0% of layer-3 attempts |
| Borderline (within 0.01 of threshold) | **0** | 0.0% of all comparisons |

This is the decisive dataset 5.4's open decision was waiting on, combined with the single real production data point recorded earlier this session (`Container orchestration`/`Kubernetes`, 0.7276 vs. 0.8804 — also 0 credited, 0 borderline). Layer 3 is **not** rarely-firing in this set — it fired on over a fifth of all comparisons, including fixture 03, which was purpose-built to need it. It contributed **zero** correct matches and sat nowhere near the threshold on any of the 130 attempts. Per 5.4's own stated decision rule (*"near-zero firing means remove it, a non-trivial BORDERLINE count means the instability is real"*): firing rate is non-trivial (20.6%), but borderline count is genuinely zero — meaning in this run, removing layer 3 would not have changed a single score, while keeping it spent real Neurons on a mechanism that has now failed to contribute a match across two independent evidence sources (the WS6.1 calibration pairs, and this real fixture set). This is evidence toward "remove it," not a unilateral decision — 5.4 reserves that call for you, and one more fixture round with a genuinely borderline pair (deliberately absent here) would be the strongest remaining test before deciding.

---

## Unverifiable-terms log (5.6/5.8)

Every matched skill and every matched qualification across all 7 fixtures came back `status: "verified"` — none `inferred`, none `unverifiable`. `qualifications.needsReview` never fired. The three-tier hallucination-control mechanism itself is unit-tested directly (`functions/_lib/filtration/verification.test.js` covers verified/inferred/unverifiable explicitly, including the "Machine Learning" vs. "learning to use the machine" scattered-word case), but **this fixture set did not exercise `inferred` or `unverifiable` end-to-end** — every fixture I wrote either has a skill literally present in the text (verified) or genuinely absent (missing), never a case where the CV implies a skill without stating it. Recorded here as a real, honest gap rather than an empty section with no explanation: a fixture built specifically to test `inferred` credit (e.g. "built REST APIs in Express" without ever writing "Node.js") is the natural next addition, not something this run can claim coverage of.

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
- The scoring formulas in 5.3 are implemented exactly as specified — 6 of 7 fixtures matched hand-derivation on the first try; the 7th caught a real error in my own derivation, not the engine's.
- The WS6.1 calibration finding (short technical terms defeat this embedding model) reproduces on realistic CVs, not just calibration pairs.
- 5.9's head-tail truncation fallback correctly preserves scorable content on two structurally different long-CV shapes (19k and 18k chars).
- WS3's failure states (image-only, corrupt, dead-Worker) all produce the required non-silent, non-blaming behavior, verified in a real browser against the real production app, including a full outage→retry→recovery cycle.
- R1–R7 access control holds.

**Does not prove, and shouldn't be read as proving:**
- General end-to-end determinism (see 6.4's caveat — this run had no near-threshold comparisons to actually test that).
- Rank stability under real score variance (same reason).
- `inferred`/`unverifiable` hallucination-control behaving correctly end-to-end (unit-tested, not fixture-tested).
- Coverage of F3/F4 as password-protected specifically — F4 here is a corrupt/truncated file, not an encrypted one; building a real encrypted PDF was scoped out as a bigger, separate piece of infrastructure work (no library in this project's toolchain writes encrypted PDFs) and is recorded here as deferred, not silently skipped.
