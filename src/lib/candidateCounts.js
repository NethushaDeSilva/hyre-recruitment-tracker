// Configurable intermediate stages remain active; terminal outcomes do not.
export const isActiveCandidate = (candidate) =>
  !!candidate.stage && candidate.stage !== "hired" && candidate.stage !== "rejected";

export const activeCandidates = (candidates) => candidates.filter(isActiveCandidate);
