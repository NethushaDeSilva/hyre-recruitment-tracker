import { expect, it, vi } from 'vitest';
import { analyzeDescription, applyDescriptionFit, validateResponsibilities } from './job-description';
import { scoreVacancyApplications } from './filtration-ai';
const embed = async texts => texts.map((t,i)=>i===0?[1,0]:[0,1]);
it('accepts only exact source quotes, no inferred role requirements or personal traits',()=>{
 expect(validateResponsibilities({responsibilities:['Build secure APIs']},'Build secure APIs for our clients.')).toEqual(['Build secure APIs']);
 expect(()=>validateResponsibilities({responsibilities:['Use Kubernetes']},'Build secure APIs')).toThrow();
 expect(()=>validateResponsibilities({responsibilities:['Prefer young workers']},'Prefer young workers')).toThrow();
});
it('uses company duties and CV evidence while preserving the qualification cap',async()=>{
 const candidate={extractedText:'Build secure APIs'};
 const matched=await applyDescriptionFit({overallScore:80,capApplied:false},candidate,['Build secure APIs'],embed);
 expect(matched.overallScore).toBe(82);expect(matched.descriptionFit.responsibilities[0].evidence).toBe('Build secure APIs');
 const missed=await applyDescriptionFit({overallScore:80,capApplied:false},{extractedText:'Managed retail stores.'},['Build secure APIs'],embed);
 expect(missed.overallScore).toBe(72);
 const capped=await applyDescriptionFit({overallScore:40,capApplied:true},candidate,['Build secure APIs'],embed);expect(capped.overallScore).toBe(40);
});
it('never substitutes zero for analysis failures or missing CV text',async()=>{
 await expect(applyDescriptionFit({overallScore:80},{},['Build secure APIs'],embed)).rejects.toThrow('CV text');
 await expect(analyzeDescription({jobContext:{description:'Build secure APIs'}},{AI:{run:async()=>({response:'garbage'})}})).rejects.toThrow();
 expect((await applyDescriptionFit({overallScore:80},{},[],embed)).overallScore).toBe(80);
});
it('analyzes one company description per batch and leaves mandatory eligibility unchanged',async()=>{
 // The embedding mock must actually discriminate between unrelated strings —
 // "Java" the required skill vs. a CV sentence that never mentions it — or
 // every embedded term registers as a perfect semantic match regardless of
 // content, which is not what real embeddings do and silently hides a real
 // scoring bug behind a fake similarity of 1.0.
 const run=vi.fn(async(model,args)=>args.messages?{response:{responsibilities:['Build secure APIs']}}:{data:args.text.map(t=>/\bjava\b/i.test(t)?[1,0]:[0,1])});
 const requirements={requiredSkills:['Java'],minYearsExperience:0,jobContext:{description:'Build secure APIs for financial services.'}};
 const results=await scoreVacancyApplications({requirements,candidates:[{candidateId:'a',skills:['Java'],extractedText:'Java. Build secure APIs'},{candidateId:'b',skills:[],extractedText:'Build secure APIs'}],env:{AI:{run}}});
 expect(run.mock.calls.filter(([,args])=>args.messages)).toHaveLength(1);
 expect(results.every(r=>r.status==='scored'&&r.result.descriptionFit.score===10)).toBe(true);
 expect(results[1].result.breakdown.coreSkills.score).toBe(0);
});
