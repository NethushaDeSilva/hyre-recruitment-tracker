import { requireStaff } from '../_lib/staff-auth.js';
import { isAllowedOrigin } from '../_lib/cors.js';
import { organizeWithAI } from '../_lib/organize-skills.js';
import { extractSkills } from '../_lib/extract-skills.js';
export async function onRequestPost({request,env}) {
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!isAllowedOrigin(request.headers.get('Origin'))) return reply({error:'Origin not allowed'},403);
 const denied=await requireStaff(request,env,headers);if(denied)return denied;
 let input;try{input=await request.json();}catch{return reply({error:'Invalid request'},400);}
 if(!['required','nice'].every(k=>typeof input[k]==='string'&&input[k].length<=12000)||input.required.length+input.nice.length>16000) return reply({error:'Please use at most 12,000 characters per field and 16,000 in total.'},400);
 if(!env.AI)return reply({error:'AI is temporarily unavailable.'},503);
 try{return reply({ok:true,...await (input.extract ? extractSkills : organizeWithAI)({required:input.required,nice:input.nice,role: { title: String(input.role?.title || "").slice(0,200), description: String(input.role?.description || "").slice(0,20000) }},env)});}catch(e){return reply({error:e.message||'Could not organize skills. Please retry.'},502);}
}
