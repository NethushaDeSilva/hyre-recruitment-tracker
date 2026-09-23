import { expect, it } from 'vitest';
import { parseSkills, publicSkillLabels } from './organizeSkills';
import { requirementEntries } from '../../functions/_lib/filtration/requirements';

const text = `Primary Core Skills
Application Security & OWASP Top 10 - Deep understanding of identifying, mitigating, and preventing web risks.
Cloud Security (AWS / GCP) - Knowledge of hardening, permissions, and encryption.
Engineering & Security Operations Skills
DevSecOps & Automated Scanning (SAST / DAST / SCA) - Experience integrating tools (e.g. SonarQube, Snyk).
Data Protection & Compliance (SOC 2, HIPAA, GDPR) - Understanding data privacy principles.`;
it('shows skill labels without headings or description fragments for existing and new positions', () => {
  const labels = parseSkills(text);
  expect(labels).toEqual(['Application Security & OWASP Top 10', 'Cloud Security (AWS / GCP)', 'DevSecOps & Automated Scanning (SAST / DAST / SCA)', 'Data Protection & Compliance (SOC 2, HIPAA, GDPR)']);
  const requirements = { requiredSkills: ['old', 'broken', 'fragments'], requiredSkillsDisplay: text, niceToHaveDisplay: text };
  expect(publicSkillLabels(requirements)).toEqual(labels);
  expect(publicSkillLabels(requirements, true)).toEqual(labels);
  expect(requirementEntries(requirements)[0].context).toContain('identifying, mitigating');
});
it('handles AI organized output and simple lists without splitting technical names', () => {
  expect(parseSkills('## Core skills\n• JavaScript — Build interfaces, components.\n• PostgreSQL - Store data.')).toEqual(['JavaScript', 'PostgreSQL']);
  expect(parseSkills('C++, C#, Node.js, CI/CD')).toEqual(['C++', 'C#', 'Node.js', 'CI/CD']);
  expect(publicSkillLabels({niceToHave:['SQL','HTML']}, true)).toEqual(['SQL','HTML']);
});
it('uses source-matched AI extraction for prose and ignores stale extraction after edits', () => {
  const source = 'Nice-to-Haves / Edge Factors\no Hands-on experience securing AI/ML models, LLM pipelines, and AI product integrations (such as a company platform).';
  const req = { niceToHaveDisplay: source, skillExtraction: { version: 1, niceSource: source,
    nice: '## Nice-to-Haves / Edge Factors\n• AI/ML models — Hands-on experience securing AI/ML models\n• LLM pipelines — Hands-on experience securing AI/ML models, LLM pipelines' } };
  expect(publicSkillLabels(req, true)).toEqual(['AI/ML models', 'LLM pipelines']);
  expect(requirementEntries(req, true)[0].context).toContain('securing');
  expect(publicSkillLabels({ ...req, niceToHaveDisplay: 'SQL' }, true)).toEqual(['SQL']);
});
