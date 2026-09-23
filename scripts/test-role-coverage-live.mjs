import {readFileSync} from 'node:fs';
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
const base = 'https://scoring-coverage-check.hyre-hiring.pages.dev';
const catalogue = [
 ['React','Vue','Angular','Svelte','SolidJS'],
 ['Jest','Vitest','Mocha','Jasmine','AVA'],
 ['Playwright','Cypress','Selenium','WebdriverIO','TestCafe'],
 ['Webpack','Vite','Rollup','Parcel','esbuild'],
 ['Tailwind CSS','Bootstrap','Bulma','Foundation','Material UI'],
 ['Redux','Zustand','MobX','Recoil','Jotai'],
 ['npm','Yarn','pnpm','Bun','Lerna'],
 ['GitHub Actions','GitLab CI','Jenkins','CircleCI','Travis CI'],
 ['Figma','Sketch','Adobe XD','InVision','Penpot'],
 ['REST','GraphQL','gRPC','WebSockets','Server-sent events']
];
const strong = catalogue.map(g=>g[0]);
for (const [name,requirements,skills] of [
 ['catalogue-strong',{requiredSkills:catalogue.flat(),jobContext:{title:'Frontend developer',department:'Engineering'}},strong],
 ['catalogue-weak',{requiredSkills:catalogue.flat(),jobContext:{title:'Frontend developer',department:'Engineering'}},['npm']],
 ['complete-stack',{requiredSkills:['Java + Spring Boot OR Node.js + Express OR Python + Django']},['Python','Django']]
]) {
 const response=await fetch(`${base}/api/rescore-vacancy`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({batchId:'coverage-'+name,requirements,candidates:[{candidateId:'synthetic-only',skills,extractedText:'Professional experience: Built production projects using '+skills.join(', ')+'.',totalYearsExperience:5,education:[]}]}),signal:AbortSignal.timeout(120000)});
 const data=await response.json(); const result=data.results?.[0]?.result;
 console.log(JSON.stringify({name,status:response.status,error:data.error||data.results?.[0]?.error,score:result?.overallScore,groups:result?.breakdown.coreSkills.capabilities}));
 if(!response.ok || !result || (name==='catalogue-weak'?result.overallScore>=50:result.overallScore<80)) process.exitCode=1;
}
await db.terminate();
