// FIX 1 — proves saveWeeklyAvailability() writes weeklyAvailability/{uid}
// AND the derived availability/{uid} in one batch (never two separate
// writes that could diverge), preserves existing exceptions untouched, and
// derives the legacy slots correctly for a real template.
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  existingExists: true,
  existingExceptions: [{ date: "2026-01-01", type: "leave", reason: "" }],
  sets: [],
  commit: vi.fn(),
}));

vi.mock("@/firebase/config", () => ({ db: {}, firebaseReady: true }));
vi.mock("firebase/firestore", () => ({
  doc: (_db, col, id) => ({ col, id }),
  getDoc: async (ref) => ({
    exists: () => state.existingExists,
    data: () => ({ exceptions: state.existingExceptions }),
  }),
  serverTimestamp: () => "SERVER_TIMESTAMP",
  writeBatch: () => ({
    set: (ref, data) => { state.sets.push({ ref, data }); },
    commit: state.commit,
  }),
  // unused by saveWeeklyAvailability, but store.js imports them at module scope
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  runTransaction: vi.fn(),
}));

const { saveWeeklyAvailability } = await import("./store.js");
const { emptyWeek } = await import("@/lib/weeklyAvailability");

beforeEach(() => {
  state.existingExists = true;
  state.existingExceptions = [{ date: "2026-01-01", type: "leave", reason: "" }];
  state.sets = [];
  state.commit.mockReset();
});

it("writes weeklyAvailability and the derived availability doc in exactly ONE batch", async () => {
  const days = {
    ...emptyWeek(),
    mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "12:00", end: "13:00" }] },
  };
  await saveWeeklyAvailability("priya-uid", days);

  expect(state.commit).toHaveBeenCalledTimes(1);
  expect(state.sets).toHaveLength(2);

  const weekly = state.sets.find((s) => s.ref.col === "weeklyAvailability");
  const legacy = state.sets.find((s) => s.ref.col === "availability");
  expect(weekly.ref.id).toBe("priya-uid");
  expect(legacy.ref.id).toBe("priya-uid");
  expect(weekly.data.days).toBe(days); // unchanged shape, exactly what it wrote before FIX 1

  expect(legacy.data.timeZone).toBe("Asia/Colombo");
  expect(legacy.data.declaredAt).toBe("SERVER_TIMESTAMP");
  expect(legacy.data.validUntil).toBeInstanceOf(Date);
  expect(legacy.data.slots).toEqual([
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
  ]);
  expect(legacy.data.exceptions).toEqual(state.existingExceptions); // preserved, not invented
});

it("never invents exceptions when no legacy doc exists yet", async () => {
  state.existingExists = false;
  await saveWeeklyAvailability("new-uid", emptyWeek());
  const legacy = state.sets.find((s) => s.ref.col === "availability");
  expect(legacy.data.exceptions).toEqual([]);
});
