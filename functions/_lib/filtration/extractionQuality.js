import { parseMonthYear } from "./computeExperience.js";

export function extractionQuality(profile, inputTruncated = false) {
  const entries = profile.experience || profile.experienceEntries || [];
  const experienceReliable = entries.length > 0 && entries.every(e => {
    const start = parseMonthYear(e.startDate);
    const ongoing = /^(present|current|currently|now|ongoing|date|todate|to date)$/i.test(String(e.endDate || "").trim());
    const end = ongoing ? null : parseMonthYear(e.endDate);
    return start?.month != null && (ongoing || end?.month != null && (end.year * 12 + end.month >= start.year * 12 + start.month));
  });
  return { complete: !inputTruncated && !profile.outputCapped, inputTruncated: !!inputTruncated,
    outputCapped: !!profile.outputCapped, outputCappedFields: profile.outputCappedFields || [], experienceReliable };
}
