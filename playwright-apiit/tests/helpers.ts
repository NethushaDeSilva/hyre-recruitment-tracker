import { Page } from '@playwright/test';

export const CREDENTIALS = {
  HR: { email: 'hr@hyre.app', password: 'hyre1234' },
  Interviewer: { email: 'interviewer@hyre.app', password: 'hyre1234' },
  Management: { email: 'management@hyre.app', password: 'hyre1234' },
  Candidate: { email: 'candidate@hyre.app', password: 'hyre1234' },
};

export async function login(page: Page, role: keyof typeof CREDENTIALS = 'HR') {
  const { email, password } = CREDENTIALS[role];
  await page.goto('/login');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/positions|\/app|\/jobs/, { timeout: 15000 });
}

// Self-registers a fresh throwaway candidate. Uses a @gmail.com address so
// the app's domain-deliverability check (functions/api/check-email-domain.js)
// passes — a fabricated domain like example.com would fail it.
export async function registerCandidate(page: Page, name = 'PW Test Candidate') {
  const email = `pw.candidate.${Date.now()}.${Math.floor(Math.random() * 1e6)}@gmail.com`;
  await page.goto('/login?mode=register');
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Amara Jayasuriya').fill(name);
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('At least 6 characters').fill('TestPass123!');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL(/\/jobs/, { timeout: 15000 });
  return { email, password: 'TestPass123!' };
}

export async function createDraftPosition(page: Page, titlePrefix: string) {
  const title = `${titlePrefix} ${Date.now()}`;
  await page.goto('/positions');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Open position' }).click();
  await page.waitForTimeout(500);
  await page.getByPlaceholder('e.g. Backend Developer').fill(title);
  await page.getByPlaceholder('Select or type a department').fill('Software Engineering');
  await page.getByPlaceholder('Describe the actual responsibilities, business domain and company-specific work...').fill('Playwright-generated test position — safe to delete.');
  await page.getByPlaceholder('e.g. React, TypeScript, Node.js').fill('TypeScript');
  await page.locator('input[type="date"]').fill('2027-01-01');
  await page.getByRole('button', { name: 'Create & open' }).click();
  await page.waitForTimeout(3000);
  return title;
}

// Applies a signed-in candidate to a position identified by its live URL,
// using the pre-built fixtures/test-cv.pdf (a synthetic but realistic-enough
// CV that passes the live AI "looks like a CV" scan — see
// fixtures/make-cv-pdf.js). Assumes the candidate has no phone/CV on file yet.
export async function applyToPosition(page: Page, positionUrl: string) {
  await page.goto(positionUrl);
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Apply now' }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Apply for this role' }).click();
  await page.waitForTimeout(800);
  await page.locator('input[type="file"]').setInputFiles(
    require('path').join(__dirname, '..', 'fixtures', 'test-cv.pdf')
  );
  await page.waitForTimeout(6000); // live AI CV-content scan
  const phone = page.getByPlaceholder('+94 7X XXX XXXX');
  if (await phone.isVisible().catch(() => false)) await phone.fill('0771234567');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await page.waitForTimeout(2500);
}

// Position deletion is a slow multi-step Firestore transaction (lock ->
// preserve employees -> chunked-delete child collections — see
// removePersistedPosition() in src/lib/positionPersistence.js), not a single
// fast write. Give it real time to finish before moving on.
export async function deletePosition(page: Page, title: string) {
  await page.goto('/positions');
  await page.waitForTimeout(1500);
  const card = page.locator('div', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last();
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(800);
  const confirmBtn = page.getByRole('button', { name: /delete/i }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  await page.waitForTimeout(10000);
}
