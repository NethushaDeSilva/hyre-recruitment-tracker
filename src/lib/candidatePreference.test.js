import { expect, it } from 'vitest';
import { preferencePlan, withdrawalPatch } from './candidatePreference';
const apps=[{id:'a',personId:'p',positionId:'one',positionTitle:'Developer',stage:'screening',comments:[{score:70}],history:[]},{id:'b',personId:'p',positionId:'two',stage:'applied',comments:[],history:[]}];
const actor={uid:'hr',name:'HR',role:'HR'};
it.each(['both','undecided'])('%s keeps all applications active without requiring a note',choice=>{
 const plan=preferencePlan(apps,'a',{choice,actor});expect(plan.withdraw).toEqual([]);expect(plan.record.note).toBe('');expect(apps[0].stage).toBe('screening');
});
it.each(['a','b'])('can keep %s and withdraw only the other application without review scores',selectedApplicationId=>{
 const plan=preferencePlan(apps,'a',{choice:'one',selectedApplicationId,actor});expect(plan.withdraw).toHaveLength(1);expect(plan.withdraw[0].id).not.toBe(selectedApplicationId);
 const patch=withdrawalPatch(plan.withdraw[0],'decision',plan.record);expect(patch.stage).toBe('withdrawn');expect(patch).not.toHaveProperty('comments');expect(patch).not.toHaveProperty('rejection');expect(patch.history[0]).not.toHaveProperty('score');
});
it('rejects mismatched candidates, terminal applications and non-HR actors',()=>{
 expect(()=>preferencePlan([apps[0],{...apps[1],personId:'other'}],'a',{choice:'both',actor})).toThrow();
 expect(()=>preferencePlan([apps[0],{...apps[1],stage:'withdrawn'}],'a',{choice:'both',actor})).toThrow();
 expect(()=>preferencePlan(apps,'a',{choice:'both',actor:{...actor,role:'Interviewer'}})).toThrow();
});
