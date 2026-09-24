// Server-side half of the availability date/time gate, exercised against the
// REAL deployed rules — not the app's own client-side check.
//
// This matters because there is no API endpoint in front of this collection:
// saveWeeklyAvailability() in src/data/store.js writes Firestore directly, so
// these rules ARE the server. A direct SDK call bypassing the UI entirely is
// exactly what this proves is refused.
//
// The rules read request.time (the server's clock), which the emulator does
// not let us pin — so "today" is derived here from the real current date in
// Asia/Colombo, and past/future days are taken relative to it.
//
// Requires the Firestore emulator (Java 21+). Run with:
//   npx firebase emulators:exec --only firestore "npx vitest run firestore.rules.availabilityGate.test.js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

const PROJECT_ID = "hyre-availability-rules-test";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const UID = "interviewer-uid";
let testEnv;

// Today, in Asia/Colombo, exactly as the rules compute it (fixed UTC+05:30).
function colomboNow() { return new Date(Date.now() + 5.5 * 3600 * 1000); }
const todayIdx = colomboNow().getUTCDay();
const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;

const emptyWeek = () => Object.fromEntries(DAY_KEYS.map((k) => [k, { enabled: true, available: [] }]));
const weekWith = (key, rows) => ({ ...emptyWeek(), [key]: { enabled: true, available: rows } });
const payload = (days) => ({ days, updatedByUid: UID, updatedAt: new Date() });

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", UID), { role: "Interviewer", name: "Priya" });
    // A stored week so the rules compare against something real (the
    // first-save path is covered separately below).
    await setDoc(doc(db, "weeklyAvailability", UID), payload(emptyWeek()));
  });
});

const asInterviewer = () => testEnv.authenticatedContext(UID, { email: "priya@hyre.app" }).firestore();
const write = (days) => setDoc(doc(asInterviewer(), "weeklyAvailability", UID), payload(days));

describe("weeklyAvailability — past days are refused server-side", () => {
  it.runIf(todayIdx > 0)("REJECTS a direct write that fills in a day earlier this week", async () => {
    // Every day before today, checked individually — on a Thursday this
    // includes Wednesday, not just the weekend.
    for (let i = 0; i < todayIdx; i++) {
      await assertFails(write(weekWith(DAY_KEYS[i], [{ start: "09:00", end: "17:00" }])));
    }
  });

  it.runIf(todayIdx > 0)("REJECTS clearing a past day that already has stored times", async () => {
    const pastKey = DAY_KEYS[todayIdx - 1];
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "weeklyAvailability", UID),
        payload(weekWith(pastKey, [{ start: "09:00", end: "12:00" }])));
    });
    await assertFails(write(emptyWeek())); // history can't be erased either
  });

  it.runIf(todayIdx > 0)("ALLOWS a write that leaves past days byte-identical while editing a future day", async () => {
    const pastKey = DAY_KEYS[todayIdx - 1];
    const stored = weekWith(pastKey, [{ start: "09:00", end: "12:00" }]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "weeklyAvailability", UID), payload(stored));
    });
    if (todayIdx < 6) {
      const next = { ...stored, [DAY_KEYS[todayIdx + 1]]: { enabled: true, available: [{ start: "09:00", end: "17:00" }] } };
      await assertSucceeds(write(next));
    }
  });
});

describe("weeklyAvailability — today is forward-only server-side", () => {
  const todayKey = DAY_KEYS[todayIdx];

  it("REJECTS a time earlier today than the server's current time", async () => {
    const past = new Date(colomboNow().getTime() - 90 * 60 * 1000);
    // Only meaningful when there IS an earlier time today to ask for.
    if (past.getUTCDate() !== colomboNow().getUTCDate()) return;
    await assertFails(write(weekWith(todayKey, [{ start: hhmm(past), end: "23:45" }])));
  });

  it("ALLOWS a time later today", async () => {
    const soon = new Date(colomboNow().getTime() + 90 * 60 * 1000);
    if (soon.getUTCDate() !== colomboNow().getUTCDate()) return; // too close to midnight to test
    await assertSucceeds(write(weekWith(todayKey, [{ start: hhmm(soon), end: "23:45" }])));
  });

  it("ALLOWS re-saving a slot stored earlier today that has since passed (grandfathered)", async () => {
    const past = new Date(colomboNow().getTime() - 90 * 60 * 1000);
    if (past.getUTCDate() !== colomboNow().getUTCDate()) return;
    const stored = weekWith(todayKey, [{ start: hhmm(past), end: "23:45" }]);
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "weeklyAvailability", UID), payload(stored));
    });
    await assertSucceeds(write(stored));
  });

  it("REJECTS an unpadded time string, which would otherwise defeat the ordering check", async () => {
    // "9:00" sorts AFTER "14:00" lexicographically — the rules require the
    // zero-padded shape rather than assuming it.
    await assertFails(write(weekWith(todayKey, [{ start: "9:00", end: "23:45" }])));
  });

  it("REJECTS more rows in one day than the unrolled row check covers", async () => {
    const soon = new Date(colomboNow().getTime() + 90 * 60 * 1000);
    if (soon.getUTCDate() !== colomboNow().getUTCDate()) return;
    const many = Array.from({ length: 13 }, () => ({ start: hhmm(soon), end: "23:45" }));
    await assertFails(write(weekWith(todayKey, many)));
  });
});

describe("weeklyAvailability — future days stay unrestricted", () => {
  it.runIf(todayIdx < 6)("ALLOWS any time on a future day, including early morning", async () => {
    await assertSucceeds(write(weekWith(DAY_KEYS[todayIdx + 1], [{ start: "00:15", end: "23:45" }])));
  });
});

describe("weeklyAvailability — first-ever save (no stored doc)", () => {
  it.runIf(todayIdx > 0)("REJECTS declaring availability on a past day when nothing is stored yet", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", UID), { role: "Interviewer", name: "Priya" });
    });
    await assertFails(write(weekWith(DAY_KEYS[todayIdx - 1], [{ start: "09:00", end: "17:00" }])));
  });

  it("ALLOWS a first save that only touches today-or-later", async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", UID), { role: "Interviewer", name: "Priya" });
    });
    if (todayIdx < 6) {
      await assertSucceeds(write(weekWith(DAY_KEYS[todayIdx + 1], [{ start: "09:00", end: "17:00" }])));
    }
  });
});
