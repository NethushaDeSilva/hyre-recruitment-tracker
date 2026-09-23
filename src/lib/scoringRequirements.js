// Exact company-authored context travels with the requirements snapshot.
export function scoringRequirements(position) {
  if (!position?.requirements) return null;
  const description = (position.description || "").trim();
  if (!description) return position.requirements;
  return { ...position.requirements, jobContext: { version: 2, title: (position.title || "").trim(), department: (position.department || "").trim(), description } };
}
