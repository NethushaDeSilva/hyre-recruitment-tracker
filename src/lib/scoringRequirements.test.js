import { expect, it } from 'vitest';
import { scoringRequirements } from './scoringRequirements';
import { needsAutomaticScore } from './automaticScoring';
import { ENGINE_VERSION } from '../../functions/_lib/filtration/engine';
import { getThresholds } from '../../functions/_lib/filtration/thresholds';
it('description changes invalidate Applied scores and no-description positions retain original requirements',()=>{
 const position={id:'p',title:'Backend',department:'Engineering',description:'Build payments',requirements:{requiredSkills:['Java']}};
 const thresholds=getThresholds();
 const score={status:'scored',requirementsSnapshot:scoringRequirements(position),meta:{engineVersion:ENGINE_VERSION,skillThreshold:thresholds.SKILL_SIMILARITY_THRESHOLD,qualThreshold:thresholds.QUAL_SIMILARITY_THRESHOLD}};
 expect(needsAutomaticScore({stage:'applied',positionId:'p'},position,score)).toBe(false);
 expect(needsAutomaticScore({stage:'applied',positionId:'p'},{...position,description:'Build logistics systems'},score)).toBe(true);
 expect(needsAutomaticScore({stage:'interview',positionId:'p'},{...position,description:'Changed'},score)).toBe(false);
 expect(scoringRequirements({...position,description:''})).toBe(position.requirements);
});
