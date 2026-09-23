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
for(const doc of positions.docs.slice(0,2)) {
 const p=doc.data();if(!p.requirements)continue;
 const requirements={...p.requirements,jobContext:{description:p.description||'',title:p.title,department:p.department}};
 const response=await fetch('https://hyre-hiring.pages.dev/api/rescore-vacancy',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({batchId:'diagnostic-'+Date.now(),requirements,candidates:[{candidateId:'diagnostic-only',skills:['React','TypeScript'],extractedText:'Frontend developer with React and TypeScript experience building accessible web interfaces.',experience:[],education:[]}]}),signal:AbortSignal.timeout(120000)});
 const result=await response.json();console.log(JSON.stringify({position:doc.id,status:response.status,error:result.error,results:result.results?.map(r=>({status:r.status,error:r.error,reason:r.reason}))}));
}
await db.terminate();
