import { scoringRequirements } from "./scoringRequirements";
import { isScoreStale } from "./scoreStaleness";
import { snapshotKey } from "./rescoreBatch";
export function needsAutomaticScore(application, position, score) {
  return application.stage === "applied" && application.positionId === position?.id && !!position?.requirements
    && (score?.status !== "scored" || isScoreStale(score) || snapshotKey(score.requirementsSnapshot) !== snapshotKey(scoringRequirements(position)));
}
