// Retain the previous formatter for historical tooling; creation always supplies
// a title code and claims its permanent per-code sequence.
export const positionIdFor = (sequence, code) => {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid position sequence");
  if (code === undefined) return `vacancy-v2-${sequence}`;
  if (!/^[A-Z0-9]{1,5}$/.test(code)) throw new Error("Invalid position code");
  return `${code}-${String(sequence).padStart(2, "0")}`;
};

export function positionCode(title) {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  const clean = word => word.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (clean(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map(word => clean(word)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
}

export function hiredPositionSnapshot(position = {}) {
  return {
    title: position.title || "",
    department: position.department || "",
    createdByUid: position.createdByUid || "",
    stageAssignees: position.stageAssignees || {},
  };
}

// Lock first. Keep the position until every dependent write succeeds. A failed
// operation can safely resume; employees and candidate identities are retained.
export async function removePositionTree(repository, positionId) {
  const position = await repository.lock(positionId);
  if (!position) return;
  await repository.preserveEmployees(positionId, position);
  for (const name of ["applications", "applicationScores", "interviews", "notifications", "validation_logs"]) {
    await repository.removeChildren(name, positionId);
  }
  await repository.removePosition(positionId);
}
