import { expect, it } from 'vitest';
import { crossRejectionPatch, crossRejectActive } from './crossRejection';
const source={id:'a',personId:'person',positionId:'p1',stage:'interview'};
const target={id:'b',personId:'person',positionId:'p2',stage:'screening',comments:[{text:'old'}],history:[]};
const options={comment:' Chosen position ',score:'',actor:{uid:'hr',role:'HR'}};
it('appends attributed feedback with zero default and preserves source',()=>{
 const original=JSON.stringify(source);const patch=crossRejectionPatch(source,target,options,123);
 expect(JSON.stringify(source)).toBe(original);expect(target.stage).toBe('screening');
 expect(patch.comments).toEqual([{text:'old'},expect.objectContaining({text:'Chosen position',score:0,byUid:'hr',at:123})]);
 expect(patch.stage).toBe('rejected');expect(patch.history[0].sourceApplicationId).toBe('a');
});
it('requires comment, valid score and matching person in different active positions',()=>{
 for (const changes of [{comment:'  '},{score:-1},{score:101},{score:'bad'}]) expect(()=>crossRejectionPatch(source,target,{...options,...changes})).toThrow();
 for (const changes of [{personId:'other'},{positionId:'p1'},{stage:'rejected'},{stage:'withdrawn'},{stage:'hired'}]) expect(()=>crossRejectionPatch(source,{...target,...changes},options)).toThrow();
 expect(()=>crossRejectionPatch({...source,stage:'applied'},target,options)).toThrow();
 expect(crossRejectActive({...target,status:'Withdrawn'})).toBe(false);
});
it.each(['screening', 'dept'])('allows cross-rejection from %s without moving the current application', (stage) => {
 const current = {...source, stage};
 expect(crossRejectionPatch(current, target, options).stage).toBe('rejected');
 expect(current.stage).toBe(stage);
});
