import { expect, it, vi } from 'vitest';
import { analyzeDescription, selectedResponsibilities } from './job-description';
it('accepts numeric strings and bounds a long valid selection without fabricating passages',()=>{
 const passages=Array.from({length:15},(_,i)=>`Maintain integration number ${i}.`);
 const source=passages.join('\n');
 expect(selectedResponsibilities({responsibilityIds:passages.map((_,i)=>String(i))},passages,source)).toEqual(passages.slice(0,12));
 expect(()=>selectedResponsibilities({responsibilityIds:[99]},passages,source)).toThrow();
});
it('restricts model output to existing IDs with enough output budget',async()=>{
 const run=vi.fn(async()=>({response:{responsibilityIds:['0']}}));
 expect(await analyzeDescription({jobContext:{description:'Build accessible interfaces.'}},{AI:{run}})).toEqual(['Build accessible interfaces.']);
 const args=run.mock.calls[0][1];
 expect(args.response_format.json_schema.properties.responsibilityIds.items.enum).toEqual([0]);
 expect(args.response_format.json_schema.properties.responsibilityIds.maxItems).toBe(12);
});
