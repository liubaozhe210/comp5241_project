import { expect, test } from '@playwright/test';

test('active ending discards an unsent draft and abandons a session with no submitted answers', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'end-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'end-test', aud: 'authenticated', role: 'authenticated', email: 'end@example.test' },
      }),
    );
  });

  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入面试间' }).click();
  await page.locator('textarea').fill('这段尚未提交的草稿不能进入面试记录。');
  await page.getByRole('button', { name: '结束并复盘' }).first().click();
  const dialog = page.getByRole('dialog', { name: '结束这次模拟面试？' });
  await expect(dialog).toContainText('当前尚未提交的草稿会被丢弃');
  await dialog.getByRole('button', { name: '结束并复盘' }).click();
  await expect(page.getByRole('main').getByText('面试已结束；由于没有已提交的回答，不生成复盘。')).toBeVisible();

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!).sessions[0]);
  expect(session.status).toBe('abandoned');
  expect(session.report).toBeNull();
  expect(session.turns.some((turn: { role: string; text: string }) => turn.role === 'user' || turn.text.includes('尚未提交'))).toBe(false);
});

test('deleting a resume removes its assessment but keeps and unlinks its interview session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'resume-delete-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'resume-delete-test', aud: 'authenticated', role: 'authenticated', email: 'resume@example.test' },
      }),
    );
    const createdAt = new Date().toISOString();
    localStorage.setItem(
      'coursehub.interview.mock.v1',
      JSON.stringify({
        resumes: [{
          id: 'resume-1',
          title: 'Saved resume',
          text: 'Resume text',
          sourceFilename: null,
          sourceMime: null,
          sourceSizeBytes: null,
          jobTitle: 'Engineer',
          seniority: 'junior',
          jobDescription: '',
          createdAt,
          updatedAt: createdAt,
        }],
        assessments: [{
          id: 'assessment-1',
          resumeId: 'resume-1',
          jobTitle: 'Engineer',
          recommendations: [],
          riskFlags: [],
          createdAt,
        }],
        sessions: [{
          id: 'session-1',
          jobTitle: 'Engineer',
          seniority: 'junior',
          interviewType: 'mixed',
          questionLimit: 4,
          askedCount: 1,
          resumeId: 'resume-1',
          status: 'in_progress',
          phase: 'introduction',
          turns: [],
          currentQuestion: { text: 'Introduce yourself.', phase: 'introduction', index: 1 },
          currentTurnId: 'turn-1',
          questionDeadlineAt: null,
          reportErrorCode: null,
          report: null,
          createdAt,
          updatedAt: createdAt,
        }],
        reviews: [],
      }),
    );
  });

  await page.goto('/zh/interview/resume/assessment');
  await expect(page.getByText('Saved resume')).toBeVisible();
  await page.getByRole('button', { name: '删除简历' }).click();
  const dialog = page.getByRole('dialog', { name: '删除这份简历？' });
  await expect(dialog).toContainText('不会自动删除关联面试记录');
  await dialog.getByRole('button', { name: '删除简历' }).click();
  await expect(page.getByText('Saved resume')).toHaveCount(0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!));
  expect(stored.resumes).toHaveLength(0);
  expect(stored.assessments).toHaveLength(0);
  expect(stored.sessions).toHaveLength(1);
  expect(stored.sessions[0].resumeId).toBeNull();
});
