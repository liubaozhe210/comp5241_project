import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

async function identity(page: Page, id: string) {
  await page.addInitScript((userId) => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify({
      access_token: userId, refresh_token: 'test-refresh', token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {id: userId, aud: 'authenticated', role: 'authenticated', email: `${userId}@example.test`},
    }));
  }, id);
}

test('teacher generates from a PDF, edits and publishes; student learns with persisted progress', async ({browser}) => {
  const teacher = await browser.newContext(); const page = await teacher.newPage(); await identity(page, 'u_t1');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/en/courses/c1/interactive');
  await page.getByLabel('Source PDF').setInputFiles(path.resolve(process.env.E2E_PDF!));
  await page.getByRole('button', {name: 'Generate course draft', exact: true}).click();
  await expect(page.getByLabel('Course title', {exact: true})).toBeVisible();
  await expect(page.getByText('Teacher', {exact: true})).toBeVisible();
  const url = page.url();
  await page.getByLabel('Course title', {exact: true}).fill('Requirements from a real PDF');
  await expect(page.getByRole('button', {name: 'Publish saved draft'})).toBeDisabled();
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('status')).toHaveText('Draft saved.');
  await page.getByRole('button', {name: 'Learner preview'}).click();
  await page.getByRole('radio', {name: 'Within two seconds', exact: true}).check();
  await page.getByRole('button', {name: 'Check answer'}).click();
  await expect(page.getByText('Correct · Attempts: 1')).toBeVisible();
  await page.getByRole('button', {name: 'Edit draft'}).click();
  await page.getByRole('button', {name: 'Publish saved draft'}).click();
  await expect(page.getByRole('status')).toHaveText('Published. Students can now open this version.');
  const studentContext = await browser.newContext(); const student = await studentContext.newPage(); await identity(student, 'u_s1');
  await student.goto(url);
  await expect(student.getByRole('button', {name: 'Complete lesson'})).toBeDisabled();
  await student.getByRole('radio', {name: 'Fast', exact: true}).check();
  await student.getByRole('button', {name: 'Check answer'}).click();
  await expect(student.getByText('Try again · Attempts: 1')).toBeVisible();
  await student.getByRole('radio', {name: 'Within two seconds', exact: true}).check();
  await student.getByRole('button', {name: 'Check answer'}).click();
  await student.getByLabel('Your response').fill('Search returns all matching results within two seconds under a normal load.');
  await student.getByRole('button', {name: 'Review response'}).click();
  await student.getByRole('button', {name: 'Complete lesson'}).click();
  await expect(student.getByRole('button', {name: 'Completed', exact: true})).toBeDisabled();
  await student.reload();
  await expect(student.getByText('Learning progress: 1/1')).toBeVisible();
  await student.setViewportSize({width: 390, height: 844});
  await expect.poll(() => student.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await student.screenshot({path: 'test-results/interactive-student-mobile.png', fullPage: true});
  await page.screenshot({path: 'test-results/interactive-teacher.png', fullPage: true});
  const outsiderContext = await browser.newContext(); const outsider = await outsiderContext.newPage(); await identity(outsider, 'u_s2');
  await outsider.goto(url);
  await expect(outsider.locator('main').getByRole('alert')).toContainText('enrollment must be approved');
  await page.goto(url.replace('/en/', '/zh/'));
  await expect(page.getByRole('heading', {name: 'PDF 互动课程工作台'})).toBeVisible();
  expect(errors).toEqual([]);
  await teacher.close(); await studentContext.close(); await outsiderContext.close();
});
