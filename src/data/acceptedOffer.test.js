// @vitest-environment jsdom
// (store.js's addComment now sanitizes via DOMPurify, which needs a DOM to
// construct its purifier — this file imports store.js transitively.)
import { expect, it, vi } from 'vitest';
vi.mock('@/firebase/config',()=>({firebaseReady:false,db:null,auth:null,storage:null}));
import {addComment,advanceStage,saveAcceptedOffer,getCandidatesFor,savePipeline} from './store';
// The Final stage now requires its actor to be ASSIGNED to it and to hold a
// confirmed interview booking (assignment is the only authority — Management
// has no exemption). These cases are about the offer/hire flow, not the gate,
// so the actor is staffed onto Final here the way HR would in Configure stages.
async function staffFinal(savePipeline, actor) {
  await savePipeline('pos_1', {
    stages: ['applied','screening','dept','interview','final','hired'],
    stageMeta: {},
    stageAssignees: { final: [actor] },
    stageSlots: [{ stageId: 'final', stageLabel: 'Final Interview', interviewerId: actor.uid, interviewerName: actor.name, scheduledAt: Date.now() + 86400000, durationMs: 3600000 }],
    removedBookingIds: [],
    actor: { uid: 'hr-cfg', name: 'HR', role: 'HR' },
  });
}

it('hires with comment, score and accepted salary without a recommendation or start date',async()=>{
 const candidate=getCandidatesFor('pos_1').find(c=>c.stage==='final');
 const actor={uid:'manager',name:'Manager',role:'Management'};
 await staffFinal(savePipeline,actor);
 await expect(saveAcceptedOffer(candidate.id,{salary:'100000',actor:{...actor,role:'HR'}})).rejects.toThrow('Management');
 await expect(saveAcceptedOffer(candidate.id,{salary:' ',actor})).rejects.toThrow('salary');
 await saveAcceptedOffer(candidate.id,{salary:'100000',actor});
 const updated=getCandidatesFor('pos_1').find(c=>c.id===candidate.id);
 expect(updated.offer).toMatchObject({salary:'100000',status:'accepted'});
 expect(updated.offer.startDate).toBeUndefined();
 expect((await advanceStage(candidate.id,actor)).reason).toBe('review-required');
 await addComment(candidate.id,{text:'Final interview completed successfully',score:90,actor});
 expect((await advanceStage(candidate.id,actor)).ok).toBe(true);
});
