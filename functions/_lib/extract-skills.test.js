import { it, expect } from 'vitest';
import { extractSkills } from './extract-skills';
it('extracts grounded labels and keeps explanations for context', async () => {
  const input = {required:'Primary Skills\nJavaScript - Build interfaces.',nice:'Edge Factors\nHands-on experience securing AI/ML models and LLM pipelines.'};
  const output = await extractSkills(input,{AI:{run:async()=>({response:{required:['JavaScript'],nice:['AI/ML models','LLM pipelines']}})}});
  expect(output.required).not.toContain('Primary Skills');
  expect(output.nice).not.toContain('Edge Factors');
  expect(output.nice).toContain('AI/ML models');
});
it('rejects invented names and prose labels', async () => {
  for(const name of ['Unknown skill','Hands-on experience securing AI/ML models','and AI product integrations']) {
    await expect(extractSkills({required:'AI/ML models',nice:''},{AI:{run:async()=>({response:{required:[name],nice:[]}})}})).rejects.toThrow();
  }
});
