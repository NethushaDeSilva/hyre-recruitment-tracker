// saveWeeklyAvailability() re-checks the clock AT THE MOMENT OF THE WRITE.
// A form left open past a slot's start time (or past Colombo midnight) has a
// stale idea of what's still schedulable, so the save path must not trust
// whatever the page was rendered with — it reads Date.now() itself.
//
// This is the shared write path every caller goes through; it is still CLIENT
// code, and the independent server-side copy lives in firestore.rules
// (see firestore.rules.availabilityGate.test.js).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { wallTimeToUTC } from "@/lib/wallClock";

const state = vi.hoisted(() => ({ storedDays: null, commit: vi.fn(), sets: [] }));

vi.mock("@/firebase/config", () => ({ db: {}, firebaseReady: true }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => ({
    exists: () => (ref.col === "weeklyAvailability" ? state.storedDays !== null : true),
    data: () => (ref.col === "weeklyAvailability" ? { days: state.storedDays } : { exceptions: [] }),
  }),
  serverTimestamp: () => "SERVER_TIMESTAMP",
  writeBatch: () => ({
    set: (ref, data) => { state.sets.push({ ref, data }); },
    commit: state.commit,
  }),
  collection: vi.fn(), onSnapshot: vi.fn(), addDoc: vi.fn(), setDoc: vi.fn(),
  updateDoc: vi.fn(), deleteDoc: vi.fn(), getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(), where: vi.fn(), arrayUnion: vi.fn(), arrayRemove: vi.fn(), runTransaction: vi.fn(),
}));

const { saveWeeklyAvailability } = await import("./store.js");
const { emptyWeek } = await import("@/lib/weeklyAvailability");

const COLOMBO = "Asia/Colombo";
// Thursday 24 Sep 2026 in Colombo — Sun/Mon/Tue/Wed are all past.
const colombo = (hour, minute = 0) => wallTimeToUTC({ timeZone: COLOMBO, year: 2026, month: 9, day: 24, hour, minute });
const day = (...rows) => ({ enabled: true, available: rows });
const row = (start, end) => ({ start, end });
const week = (o = {}) => ({ ...emptyWeek(), ...o });

beforeEach(() => {
  state.storedDays = emptyWeek();
  state.sets = [];
  state.commit.mockReset();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe("saveWeeklyAvailability clock gate", () => {
  it("rejects a write that edits a day already past (Wednesday, when today is Thursday)", async () => {
    vi.setSystemTime(colombo(14, 30));
    await expect(saveWeeklyAvailability("uid-1", week({ wed: day(row("09:00", "12:00")) })))
      .rejects.toMatchObject({ code: "availability-past-time" });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("rejects a write that adds a time earlier today than right now", async () => {
    vi.setSystemTime(colombo(14, 30));
    await expect(saveWeeklyAvailability("uid-1", week({ thu: day(row("11:00", "12:00")) })))
      .rejects.toMatchObject({ code: "availability-past-time" });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("accepts a later time today and any time on a future day", async () => {
    vi.setSystemTime(colombo(14, 30));
    await saveWeeklyAvailability("uid-1", week({ thu: day(row("15:00", "17:00")), sat: day(row("08:00", "09:00")) }));
    expect(state.commit).toHaveBeenCalledTimes(1);
    expect(state.sets.map((s) => s.ref.col).sort()).toEqual(["availability", "weeklyAvailability"]);
  });

  it("re-reads the clock at save time: the SAME week object is accepted at 10:00 and refused at 14:30", async () => {
    const days = week({ thu: day(row("11:00", "12:00")) });

    // Rendered and valid in the morning...
    vi.setSystemTime(colombo(10, 0));
    await saveWeeklyAvailability("uid-1", days);
    expect(state.commit).toHaveBeenCalledTimes(1);

    // ...the page sits open; by the afternoon that same payload is stale.
    // Nothing about `days` changed — only the clock did.
    state.storedDays = emptyWeek();
    state.commit.mockReset();
    vi.setSystemTime(colombo(14, 30));
    await expect(saveWeeklyAvailability("uid-1", days)).rejects.toMatchObject({ code: "availability-past-time" });
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("does not invalidate a slot that is already stored for today, even once it has passed", async () => {
    // Stored this morning; it's now the afternoon and the user edits Friday.
    state.storedDays = week({ thu: day(row("09:00", "10:00")) });
    vi.setSystemTime(colombo(14, 30));
    await saveWeeklyAvailability("uid-1", week({ thu: day(row("09:00", "10:00")), fri: day(row("09:00", "17:00")) }));
    expect(state.commit).toHaveBeenCalledTimes(1);
  });
});
