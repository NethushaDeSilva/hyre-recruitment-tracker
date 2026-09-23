import { expect, it, vi } from 'vitest';
import { analyzeDescription, descriptionPassages, selectedResponsibilities } from './job-description';
it('selects original passages without requiring the model to reproduce wording',async()=>{
 const description='Build secure APIs for Altrium.\nMaintain integrations with customer systems.';
 const env={AI:{run:vi.fn(async()=>({response:{responsibilityIds:[1,0,1]}}))}};
 expect(await analyzeDescription({jobContext:{description}},env)).toEqual(['Maintain integrations with customer systems.','Build secure APIs for Altrium.']);
 expect(env.AI.run.mock.calls[0][1].messages[0].content).toContain('never rewrite');
});
it('retries malformed model output but never accepts invented source IDs',async()=>{
 const run=vi.fn().mockResolvedValueOnce({response:{responsibilityIds:[99]}}).mockResolvedValueOnce({response:{responsibilityIds:[0]}});
 expect(await analyzeDescription({jobContext:{description:'Build secure APIs.'}},{AI:{run}})).toEqual(['Build secure APIs.']);
 expect(run).toHaveBeenCalledTimes(2);
 expect(()=>selectedResponsibilities({responsibilityIds:[-1]},['Build secure APIs.'],'Build secure APIs.')).toThrow();
});
it('preserves source evidence for long descriptions and unfamiliar punctuation',()=>{
 const source='Build Node.js services for customers.\n'+('Maintain integrations '.repeat(100));
 const passages=descriptionPassages(source);
 expect(passages.every(p=>source.includes(p)&&p.length<=1500)).toBe(true);
 expect(passages[0]).toBe('Build Node.js services for customers.');
});
