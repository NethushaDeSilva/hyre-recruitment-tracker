// WS8 Part C — deterministic interviewer ranking. No LLM, no randomness, no
// hidden state: every output is reproducible from the inputs alone, and every
// person's placement (or exclusion) carries a plain-language reason that gets
// STORED on the interview record by the caller — this module never recomputes
// an explanation later, it only ever produces one, once, at request time.
import { availabilityState, slotIsDeclaredFree } from "@/lib/availability";

/**
 * §6 — specialisation/seniority levels were removed from the whole system;
 * ranking runs on declared availability and current booking load alone.
 * @param {Array<{uid,name,role}>} interviewers - already stage-owner-role
 *   filtered by the caller (store.js)
 * @param {number} targetMs - the proposed interview instant (absolute ms)
 * @param {Record<string, object|null>} availabilityRecords - raw declared-
 *   availability records keyed by uid (see src/lib/availability.js)
 * @param {Record<string, number>} bookingCounts - current
 *   pending_confirmation + confirmed interview count, keyed by uid
 * @returns {{
 *   ranked: Array<{uid,name,rank,reasons:string[]}>,
 *   excluded: Array<{uid,name,reason:string}>,
 *   poolReason: string|null,
 * }}
 */
export function rankEligibleInterviewers({ interviewers, targetMs, availabilityRecords, bookingCounts }) {
  const evaluated = (interviewers || []).map((p) => {
    const record = availabilityRecords?.[p.uid] || null;
    const state = availabilityState(record);
    // §8.2's core rule, applied here rather than just at display time: unknown
    // is EXCLUDED, never ranked last. There is no slot to offer someone whose
    // schedule we don't know — that is a different failure mode than "busy",
    // and conflating them would let a stale/never-declared person quietly
    // surface as if they were merely a low-priority pick.
    if (state === "unknown") {
      return { uid: p.uid, name: p.name, eligible: false, reason: "Has not declared availability" };
    }
    if (state === "unavailable") {
      return { uid: p.uid, name: p.name, eligible: false, reason: "Declared unavailable" };
    }
    if (!slotIsDeclaredFree(record, targetMs)) {
      return { uid: p.uid, name: p.name, eligible: false, reason: "Not declared free at the proposed time" };
    }

    return { uid: p.uid, name: p.name, eligible: true, load: bookingCounts?.[p.uid] || 0 };
  });

  const eligible = evaluated
    .filter((e) => e.eligible)
    // fewest booked interviews first; alphabetical is the deterministic
    // tie-break (mirrors WS5 5.8's ID-ascending tie-break — never submission
    // order, never anything that rewards being processed first)
    .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));

  const ranked = eligible.map((e, i) => {
    const reasons = [
      "Declared available for the proposed time",
      `${e.load} current interview${e.load === 1 ? "" : "s"} booked`,
    ];
    reasons.push(
      i === 0
        ? "Ranked first — fewest current bookings among eligible interviewers"
        : `Ranked ${i + 1} of ${eligible.length} — ${eligible[0].load} vs. ${e.load} current bookings for the top pick`
    );
    return { uid: e.uid, name: e.name, rank: i + 1, reasons };
  });

  const excluded = evaluated.filter((e) => !e.eligible).map((e) => ({ uid: e.uid, name: e.name, reason: e.reason }));

  return { ranked, excluded, poolReason: ranked.length === 0 ? poolReasonFor(excluded) : null };
}

// The plain-language line HR sees when the pool is empty — requirement is
// literal: "no interviewers have declared availability" when that's actually
// why, not a generic "nobody available" that hides the cause.
function poolReasonFor(excluded) {
  if (excluded.length === 0) return "No interviewers are configured for this stage.";
  const reasons = new Set(excluded.map((e) => e.reason));
  if ([...reasons].every((r) => r === "Has not declared availability")) {
    return "No interviewers have declared availability.";
  }
  if ([...reasons].every((r) => r === "Not declared free at the proposed time" || r === "Has not declared availability" || r === "Declared unavailable")) {
    return "No interviewers are free at the proposed time.";
  }
  return "No interviewers are currently available.";
}
