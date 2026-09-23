import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getFirestore as adminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, updateDoc, terminate } from 'firebase/firestore';
import { persistCandidatePreference } from '../src/lib/candidatePreference.js';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8189';
const projectId='demo-hyre-preference';const endpoint=`http://127.0.0.1:8189/emulator/v1/projects/${projectId}`;
const response=await fetch(`${endpoint}:securityRules`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:readFileSync('firestore.rules','utf8')}]}})});
assert.equal(response.ok,true,await response.text());await fetch(`${endpoint}/databases/(default)/documents`,{method:'DELETE'});
const admin=adminFirestore(adminApp({projectId}));
for(const [uid,role] of [['hr','HR'],['interviewer','Interviewer'],['candidate','Candidate']]) await admin.doc(`users/${uid}`).set({role});
for(const id of ['p1','p2','p3']) await admin.doc(`positions/${id}`).set({title:id});
const source={personId:'person',positionId:'p1',stage:'screening',comments:[{text:'Keep feedback',score:81}],history:[]};
const target={...source,positionId:'p2',stage:'applied'};
const reset=async()=>{await admin.doc('applications/a').set(source);await admin.doc('applications/b').set(target);};
const clients=[];const client=uid=>{const db=getFirestore(initializeApp({projectId,apiKey:'demo'},uid));connectFirestoreEmulator(db,'127.0.0.1',8189,{mockUserToken:{sub:uid}});clients.push(db);return db;};
const hr=client('hr'),interviewer=client('interviewer');const actor={uid:'hr',role:'HR',name:'HR person'};
try {
 for(const choice of ['both','undecided']) {await reset();await persistCandidatePreference(hr,['a','b'],'a',{choice,actor});assert.deepEqual((await admin.doc('applications/a').get()).data(),source);assert.deepEqual((await admin.doc('applications/b').get()).data(),target);}
 for(const selectedApplicationId of ['a','b']) {
  await reset();await persistCandidatePreference(hr,['a','b'],'a',{choice:'one',selectedApplicationId,note:'Confirmed on call',actor});
  const withdrawn=selectedApplicationId==='a'?'b':'a';const original=withdrawn==='a'?source:target;
  const data=(await admin.doc(`applications/${withdrawn}`).get()).data();assert.equal(data.stage,'withdrawn');assert.deepEqual(data.comments,original.comments);assert.equal(data.rejection,undefined);assert.equal(data.withdrawal.score,undefined);
  assert.deepEqual((await admin.doc(`applications/${selectedApplicationId}`).get()).data(),selectedApplicationId==='a'?source:target);
 }
 await reset();await admin.doc('applications/c').set({...target,positionId:'p3'});await persistCandidatePreference(hr,['a','b','c'],'a',{choice:'one',selectedApplicationId:'a',actor});assert.equal((await admin.doc('applications/c').get()).data().stage,'withdrawn');
 await reset();await assert.rejects(persistCandidatePreference(interviewer,['a','b'],'a',{choice:'one',selectedApplicationId:'a',actor}),e=>e.code==='permission-denied');
 await assert.rejects(updateDoc(doc(hr,'applications','b'),{stage:'withdrawn'}),e=>e.code==='permission-denied');
 await admin.doc('applications/b').update({personId:'someone-else'});await assert.rejects(persistCandidatePreference(hr,['a','b'],'a',{choice:'one',selectedApplicationId:'a',actor}),/changed/);
 console.log('PASS preferences: both/undecided unchanged, choose either position, multiple withdrawals, no score/rejection, role and identity restrictions');
} finally {await Promise.all(clients.map(terminate));await admin.terminate();}
