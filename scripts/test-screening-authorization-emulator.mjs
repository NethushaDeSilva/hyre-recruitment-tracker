import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, updateDoc, terminate } from 'firebase/firestore';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8189';
const projectId='demo-hyre-screening';
const endpoint=`http://127.0.0.1:8189/emulator/v1/projects/${projectId}`;
const response=await fetch(`${endpoint}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync('firestore.rules','utf8')}]}})});
assert.equal(response.ok,true,await response.text());
const admin=adminFirestore(adminApp({projectId}));
const clients=[];
const client=uid=>{const db=getFirestore(initializeApp({projectId,apiKey:'demo'},uid));connectFirestoreEmulator(db,'127.0.0.1',8189,{mockUserToken:{sub:uid}});clients.push(db);return db;};
for(const [uid,role] of [['hr','HR'],['other','HR'],['manager','Management']]) await admin.doc(`users/${uid}`).set({role});
const hr=client('hr'),other=client('other'),manager=client('manager');
const position={title:'Test',stageAssignees:{screening:[{uid:'hr'}]}};
const booking={kind:'stage_assignment',positionId:'p',stageId:'screening',interviewerId:'hr',status:'confirmed',scheduledAt:new Date('2026-09-22T10:00:00Z'),durationMs:3600000};
const reset=async()=>{await admin.doc('positions/p').set(position);await admin.doc('interviews/slot').set(booking);await admin.doc('applications/a').set({positionId:'p',personId:'person',stage:'screening',history:[]});};
const move=db=>updateDoc(doc(db,'applications/a'),{stage:'dept',screeningAuthorization:{assignmentIndex:0,interviewId:'slot'}});
const denied=fn=>assert.rejects(fn,e=>e.code==='permission-denied');
try {
 await reset();await denied(()=>updateDoc(doc(hr,'applications/a'),{stage:'dept'}));
 await reset();await move(hr);
 for(const db of [other,manager]) {await reset();await denied(()=>move(db));}
 for(const patch of [{status:'cancelled'},{positionId:'other'},{stageId:'final'},{interviewerId:'other'},{durationMs:0},{kind:'candidate_interview'}]) {await reset();await admin.doc('interviews/slot').update(patch);await denied(()=>move(hr));}
 await reset();await admin.doc('interviews/slot').delete();await denied(()=>move(hr));
 await reset();await admin.doc('positions/p').update({stageAssignees:{screening:[]}});await denied(()=>move(hr));
 await updateDoc(doc(hr,'applications/a'),{stage:'rejected'});
 await reset();await admin.doc('positions/p').update({stageAssignees:{}});await admin.doc('applications/a').update({stage:'applied'});await updateDoc(doc(other,'applications/a'),{stage:'screening'});
 await reset();await admin.doc('positions/p').update({stageAssignees:{screening:{uid:'hr'}}});await move(hr);
 console.log('PASS: assigned HR with saved slot advances; missing configuration, wrong user/role/position/stage, cancelled and invalid bookings blocked; any HR enters screening; rejection preserved; legacy assignment supported.');
} finally {await Promise.all(clients.map(terminate));await admin.terminate();}
