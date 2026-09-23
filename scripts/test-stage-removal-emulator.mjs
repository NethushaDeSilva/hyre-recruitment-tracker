import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeApp as adminApp} from 'firebase-admin/app';
import {getFirestore as adminFirestore} from 'firebase-admin/firestore';
import {initializeApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,terminate} from 'firebase/firestore';
import {commitInterviewChanges} from '../src/lib/interviewPersistence.js';
import {cancelStageBookings} from '../src/lib/stageBookingChanges.js';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8189';
const projectId='demo-hyre-stage-removal';
const response=await fetch(`http://127.0.0.1:8189/emulator/v1/projects/${projectId}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync('firestore.rules','utf8')}]}})});
assert.equal(response.ok,true,await response.text());
const admin=adminFirestore(adminApp({projectId}));
await admin.doc('users/hr').set({role:'HR'});
await admin.doc('positions/p').set({status:'Open',stageAssignees:{screening:[{uid:'hr'}]}});
await admin.doc('interviews/old').set({kind:'stage_assignment',positionId:'p',stageId:'screening',interviewerId:'hr',status:'confirmed',scheduledAt:new Date('2026-09-25T10:00:00Z'),durationMs:3600000});
const db=getFirestore(initializeApp({projectId,apiKey:'demo'}));connectFirestoreEmulator(db,'127.0.0.1',8189,{mockUserToken:{sub:'hr'}});
try {
 await commitInterviewChanges(db,b=>cancelStageBookings(b,'p',['old']),{id:'p',data:{stageAssignees:{}}});
 assert.equal((await admin.doc('interviews/old').get()).data().status,'cancelled');
 assert.deepEqual((await admin.doc('positions/p').get()).data().stageAssignees,{});
 await commitInterviewChanges(db,()=>[{id:'replacement',data:{kind:'stage_assignment',positionId:'p',stageId:'screening',interviewerId:'hr',status:'confirmed',scheduledAt:new Date('2026-09-25T10:00:00Z'),durationMs:3600000}}]);
 assert.equal((await admin.doc('interviews/replacement').get()).data().status,'confirmed');
 console.log('PASS: atomic stage removal, cancellation retained, released time can be booked again under deployed rules.');
} finally {await terminate(db);await admin.terminate();}
