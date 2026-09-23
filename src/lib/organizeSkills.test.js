import { expect, it } from 'vitest';
import { organizeSkills, parseSkills } from './organizeSkills';
it('cleans headings, bullets and duplicates while retaining meaningful skill descriptions', () => {
  const input = '# Required skills\n1. **React**, TypeScript\n• React\nFrameworks: Next.js; Vue\n- Accessibility: WCAG experience';
  expect(parseSkills(input)).toEqual(['React', 'TypeScript', 'Next.js', 'Vue', 'Accessibility: WCAG experience']);
  expect(parseSkills(organizeSkills(input))).toEqual(parseSkills(input));
  expect(organizeSkills(organizeSkills(input))).toBe(organizeSkills(input));
});
it('keeps prose and punctuation in technical skill names instead of inventing skills', () => {
  expect(parseSkills('Build accessible interfaces with React and collaborate with designers.')).toEqual(['Build accessible interfaces with React and collaborate with designers.']);
  expect(parseSkills('C++, C#, Node.js, CI/CD')).toEqual(['C++', 'C#', 'Node.js', 'CI/CD']);
  expect(parseSkills('Required skills:\n')).toEqual([]);
});
