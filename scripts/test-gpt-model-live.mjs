import {readFileSync} from 'node:fs';
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
const app=initializeApp({credential:cert(JSON.parse(readFileSync('serviceAccountKey.json','utf8')))});
const db=getFirestore(app);
const positions=await db.collection('positions').get();
console.log('Positions:',positions.docs.map(d=>({id:d.id,title:d.data().title})));
const hr=await db.collection('users').where('role','==','HR').limit(1).get();
const token=await getAuth(app).createCustomToken(hr.docs[0].id);
const env=readFileSync('.env.local','utf8');const key=env.match(/^VITE_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const login=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
const auth=await login.json();if(!auth.idToken)throw new Error('Diagnostic authentication failed');
const base=process.env.HYRE_TEST_BASE || 'https://model-check.hyre-hiring.pages.dev';
const cv='Alex Example\nContact details: alex@example.com\nSummary: Frontend developer building accessible applications.\nSkills: React, TypeScript, HTML, CSS, Next.js\nWork experience: Frontend Developer at Example Software, January 2021 to Present. Built React interfaces and TypeScript components, integrated REST APIs and tested applications.\nEducation: Bachelor of Science in Computer Science, Example University, 2020.\nLanguages: English';
for(const [route,body] of [['validate-cv',{text:cv}],['parse-cv',{text:cv}],['organize-skills',{required:'Primary core skills\nTypeScript - Strong typing and interfaces.\nReact.js - Build reusable components.',nice:''}]]) {
 const response=await fetch(`${base}/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const data=await response.json();console.log(JSON.stringify({route,status:response.status,...data}));
 if(!response.ok || data.ok===false) process.exitCode=1;
}
for(const doc of positions.docs.slice(0,2)) {
 const p=doc.data();if(!p.requirements)continue;
 const requirements={...p.requirements,jobContext:{description:p.description||'',title:p.title,department:p.department}};
 const response=await fetch(`${base}/api/rescore-vacancy`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({batchId:'diagnostic-'+Date.now(),requirements,candidates:[{candidateId:'diagnostic-only',skills:['React','TypeScript'],extractedText:'Frontend developer with React and TypeScript experience building accessible web interfaces.',experience:[],education:[]}]}),signal:AbortSignal.timeout(120000)});
 const result=await response.json();console.log(JSON.stringify({position:doc.id,status:response.status,error:result.error,results:result.results?.map(r=>({status:r.status,error:r.error,reason:r.reason}))}));
}
await db.terminate();
