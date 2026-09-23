import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { crossRejectActive, canCrossRejectFromStage } from "./crossRejection.js";

// The most positions a candidate may be actively pursuing in parallel at
// once — enforced at apply-time (see applyToPosition in data/store.js).
// Defined once here since it's the natural home of cross-position policy.
export const MAX_CONCURRENT_POSITIONS = 2;

export function preferencePlan(applications, sourceId, { choice, selectedApplicationId = "", note = "", actor }, at = Date.now()) {
  const source = applications.find(a => a.id === sourceId);
  if (actor?.role !== "HR" || !actor.uid) throw new Error("Only HR can record a candidate's position preference.");
  if (!source?.personId || !crossRejectActive(source) || !canCrossRejectFromStage(source)) throw new Error("Open an active application at the Final Interview stage.");
  if (!["both", "one", "undecided"].includes(choice)) throw new Error("Choose a preference.");
  if (applications.length < 2 || applications.some(a => a.personId !== source.personId || !crossRejectActive(a))) throw new Error("The active applications changed. Review the list and try again.");
  if (new Set(applications.map(a => a.positionId)).size !== applications.length) throw new Error("The application list contains duplicate positions.");
  const selected = applications.find(a => a.id === selectedApplicationId);
  if (choice === "one" && !selected) throw new Error("Select the position the candidate wants to pursue.");
  const record = { personId: source.personId, sourceApplicationId: sourceId, choice, selectedApplicationId: choice === "one" ? selected.id : "", selectedPositionTitle: choice === "one" ? selected.positionTitle || selected.positionId : "", applicationIds: applications.map(a => a.id), byUid: actor.uid, by: actor.name || "HR", at, note: note.trim() };
  return { record, withdraw: choice === "one" ? applications.filter(a => a.id !== selected.id) : [] };
}
export function withdrawalPatch(application, preferenceId, record) {
  const event = { type: "withdraw", from: application.stage, to: "withdrawn", reason: "Candidate preference", comment: record.note, preferenceId, selectedApplicationId: record.selectedApplicationId, byUid: record.byUid, by: record.by, byRole: "HR", at: record.at };
  return { stage: "withdrawn", withdrawal: event, history: [...(application.history || []), event], ...(Object.hasOwn(application, "status") ? { status: "Withdrawn" } : {}) };
}
export async function persistCandidatePreference(db, applicationIds, sourceId, options) {
  const ref = doc(collection(db, "candidatePreferences"));
  await runTransaction(db, async tx => {
    const applications = [];
    for (const id of applicationIds) {
      const snap = await tx.get(doc(db, "applications", id));
      if (!snap.exists()) throw new Error("An application was removed. Review the list and try again.");
      applications.push({ ...snap.data(), id });
    }
    const { record, withdraw } = preferencePlan(applications, sourceId, options);
    if (record.choice === "one") {
      const kept = applications.find(a => a.id === record.selectedApplicationId);
      const position = await tx.get(doc(db, "positions", kept.positionId));
      if (!position.exists()) throw new Error("The selected position no longer exists.");
      record.selectedPositionTitle = position.data().title || kept.positionId;
    }
    tx.set(ref, { ...record, createdAt: serverTimestamp() });
    for (const application of withdraw) tx.update(doc(db, "applications", application.id), withdrawalPatch(application, ref.id, record));
  });
  return ref.id;
}
