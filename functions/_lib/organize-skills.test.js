import { expect, it, vi } from 'vitest';
import { organizeWithAI, validateOrganizedSkills } from './organize-skills';
const input={required:'Primary core skills\nTypeScript - Strong typing, interfaces and generics.\nReact.js - Build reusable components.\nNext.js - Server rendering.',nice:''};
const result={required:[{heading:'Primary core skills',skills:[{name:'TypeScript',description:'Strong typing, interfaces and generics.'},{name:'React.js',description:'Build reusable components.'},{name:'Next.js',description:'Server rendering.'}]}],nice:[]};
it('uses AI to retain headings and attach descriptions to individual skills',async()=>{
 const run=vi.fn(async()=>({response:JSON.stringify(result)}));
 const output=await organizeWithAI(input,{AI:{run}});
 expect(run).toHaveBeenCalledOnce();
 expect(output.required).toContain('## Primary core skills');
 expect(output.required).toContain('TypeScript');
 expect(output.required).toContain('Strong typing, interfaces and generics.');
 expect(output.nice).toBe('');
});
it('rejects invented requirements and cross-field moves',()=>{
 expect(()=>validateOrganizedSkills({...result,nice:result.required},input)).toThrow();
 expect(()=>validateOrganizedSkills({required:[{heading:'Primary core skills',skills:[{name:'Angular',description:''}]}],nice:[]},input)).toThrow();
 expect(()=>validateOrganizedSkills({required:[],nice:[]},input)).toThrow();
});
