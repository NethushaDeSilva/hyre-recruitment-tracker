import {readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const planPath=join(tmpdir(),'hyre-reviewed-skill-extraction.json');
const apply=process.argv.includes('--apply');
const saved=apply?JSON.parse(readFileSync(planPath,'utf8')):{};
import {initializeApp,cert} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
const app=initializeApp({credential:cert(JSON.parse(readFileSync('serviceAccountKey.json','utf8')))});
const db=getFirestore(app);
const hr=await db.collection('users').where('role','==','HR').limit(1).get();
const token=await getAuth(app).createCustomToken(hr.docs[0].id);
const env=readFileSync('.env.local','utf8');const key=env.match(/^VITE_FIREBASE_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const login=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
const auth=await login.json();if(!auth.idToken)throw new Error('Diagnostic authentication failed');
import {parseSkills} from '../src/lib/organizeSkills.js';
const base=process.env.HYRE_TEST_BASE || 'https://skill-extraction-check.hyre-hiring.pages.dev';
const positions=await db.collection('positions').get();
for(const doc of positions.docs){
 const p=doc.data(), r=p.requirements;
 if(!r?.requiredSkills?.length || p.deleting || p.deletedAt) continue;
 const required=r.requiredSkillsDisplay || r.requiredSkills.join('\n');
 const nice=r.niceToHaveDisplay || (r.niceToHave||[]).join('\n');
 let output;
 if(apply){
  if(saved[doc.id]?.source!==JSON.stringify(r))throw new Error('Requirements changed since preview');
  output=saved[doc.id].output;
 } else {
 const response=await fetch(base+'/api/organize-skills',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.idToken},body:JSON.stringify({required,nice,extract:true,role:{title:p.title,description:p.description}}),signal:AbortSignal.timeout(110000)});
 output=await response.json();
 if(!response.ok || !output.ok)throw new Error(doc.id+': '+output.error);
 saved[doc.id]={source:JSON.stringify(r),output};
 writeFileSync(planPath,JSON.stringify(saved));
 }
 const extraction={version:1,requiredSource:required,niceSource:nice,required:output.required,nice:output.nice};
 console.log(JSON.stringify({id:doc.id,required:parseSkills(output.required),nice:parseSkills(output.nice)}));
 if(process.argv.includes('--apply')) await db.runTransaction(async tx=>{
  const current=await tx.get(doc.ref);
  if(JSON.stringify(current.data()?.requirements)!==JSON.stringify(r))throw new Error('Position changed during extraction');
  tx.update(doc.ref,{requirements:{...r,requiredSkillsDisplay:required,niceToHaveDisplay:nice,requiredSkills:parseSkills(output.required),niceToHave:parseSkills(output.nice),skillExtraction:extraction}});
 });
}
await db.terminate();
