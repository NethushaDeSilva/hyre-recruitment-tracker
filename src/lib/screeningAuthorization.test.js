import { expect, it } from 'vitest';
import { screeningAuthorization } from './screeningAuthorization';
import { canAdvanceStageFor } from './stages';
const actor={uid:'priya',name:'Priya',role:'HR'};
const position={id:'p',stageAssignees:{screening:[{uid:'priya',name:'Priya',role:'HR'}]}};
const booking={id:'b',positionId:'p',stageId:'screening',kind:'stage_assignment',interviewerId:'priya',status:'confirmed',scheduledAt:Date.now(),durationMs:3600000};
it('allows any HR into screening but requires exact assignment to act within screening',()=>{
 expect(canAdvanceStageFor(actor,{id:'p'},'applied')).toBe(true);
 expect(canAdvanceStageFor(actor,{id:'p'},'screening')).toBe(false);
 expect(canAdvanceStageFor({...actor,uid:'other'},position,'screening')).toBe(false);
 expect(canAdvanceStageFor({...actor,role:'Management'},position,'screening')).toBe(false);
});
it('requires the assigned person and a confirmed screening slot for this position',()=>{
 expect(screeningAuthorization(position,actor,[booking]).ok).toBe(true);
 expect(screeningAuthorization(position,actor,[]).reason).toBe('screening-time-required');
 for(const change of [{positionId:'other'},{stageId:'dept'},{interviewerId:'other'},{status:'cancelled'},{kind:'candidate_interview'},{durationMs:0}]) expect(screeningAuthorization(position,actor,[{...booking,...change}]).ok).toBe(false);
 expect(screeningAuthorization({id:'p'},actor,[booking]).ok).toBe(false);
});
