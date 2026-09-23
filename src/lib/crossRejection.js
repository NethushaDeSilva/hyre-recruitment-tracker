import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

export const crossRejectActive = (a) => !!a?.stage && !["rejected", "withdrawn", "hired"].includes(a.stage.toLowerCase()) && !["rejected", "withdrawn", "hired"].includes((a.status || "").toLowerCase());
export const canCrossRejectFromStage = (a) => ["screening", "dept", "interview", "interview2", "final"].includes(a?.stage);
export function crossRejectionPatch(source, target, { comment, score = 0, actor }, at = Date.now()) {
  const value = score === "" ? 0 : Number(score);
  if (!comment?.trim()) throw new Error("A comment is required.");
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Score must be between 0 and 100.");
  if (!["HR", "Interviewer"].includes(actor?.role) || !actor?.uid) throw new Error("Only HR or interviewers can cross-reject.");
  if (!source?.personId || source.personId !== target?.personId || source.positionId === target.positionId || source.id === target.id) throw new Error("Applications must belong to the same person in different positions.");
  if (!crossRejectActive(source) || !canCrossRejectFromStage(source) || !crossRejectActive(target)) throw new Error("The applications have changed or the current application is not in HR Screening or an interview stage.");
  const fields = { byUid: actor.uid, by: actor.name || "", byRole: actor.role, at };
  const text = comment.trim();
  const entry = { ...fields, text, score: value, stage: target.stage, sourceApplicationId: source.id, type: "cross_reject" };
  return {
    stage: "rejected",
    comments: [...(target.comments || []), entry],
    history: [...(target.history || []), { ...fields, type: "reject", from: target.stage, to: "rejected", reason: "Candidate chose another position", comment: text, score: value, sourceApplicationId: source.id }],
    rejection: { ...fields, reason: "Candidate chose another position", comment: text, score: value, stage: target.stage },
    crossRejection: { sourceApplicationId: source.id, personId: source.personId, byUid: actor.uid, at },
    ...(Object.hasOwn(target, "status") ? { status: "Rejected" } : {}),
  };
}
export async function persistCrossRejection(db, sourceId, targetId, options) {
  return runTransaction(db, async (tx) => {
    const sourceRef = doc(db, "applications", sourceId), targetRef = doc(db, "applications", targetId);
    const sourceSnap = await tx.get(sourceRef), targetSnap = await tx.get(targetRef);
    if (!sourceSnap.exists() || !targetSnap.exists()) throw new Error("An application no longer exists. Refresh and try again.");
    const source = { ...sourceSnap.data(), id: sourceId }, target = { ...targetSnap.data(), id: targetId };
    const patch = crossRejectionPatch(source, target, options);
    tx.update(targetRef, { ...patch, crossRejection: { ...patch.crossRejection, committedAt: serverTimestamp() } });
  });
}
