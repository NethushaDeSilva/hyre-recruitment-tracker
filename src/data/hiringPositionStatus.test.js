// @vitest-environment jsdom
// (store.js's addComment now sanitizes via DOMPurify, which needs a DOM to
// construct its purifier — this file imports store.js transitively.)
import { expect, it, vi } from 'vitest';
vi.mock('@/firebase/config',()=>({firebaseReady:false,db:null,auth:null,storage:null}));
import { addComment, advanceStage, sendOffer, respondToOffer, getPosition, getCandidatesFor } from './store';
import { effectiveStatus } from '@/lib/positions';
it('hiring at the legacy headcount limit preserves the vacancy and its deadline',async()=>{
 const position=getPosition('pos_1');
 const deadline=Date.now()+30*86400000;
 Object.assign(position,{status:'Open',headcount:1,hiredCount:0,closesAt:deadline});
 const candidate=getCandidatesFor(position.id).find(c=>c.stage==='final');
 expect(candidate).toBeTruthy();
 const actor={uid:'hr-test',name:'HR Test',role:'Management'};
 await addComment(candidate.id,{text:'Approved after interview',score:90,recommendation:'advance',actor});
 await sendOffer(candidate.id,{salary:'100000',startDate:'2026-11-01',actor});
 await respondToOffer(candidate.id,{status:'accepted',actor});
 expect((await advanceStage(candidate.id,actor)).ok).toBe(true);
 const updated=getPosition(position.id);
 expect(updated.hiredCount).toBe(1);expect(updated.status).toBe('Open');expect(updated.closesAt).toBe(deadline);
 expect(effectiveStatus(updated,deadline-1)).toBe('Open');expect(effectiveStatus(updated,deadline)).toBe('Closed');
 expect(effectiveStatus({...updated,closesAt:0,hiredCount:50})).toBe('Open');
});
