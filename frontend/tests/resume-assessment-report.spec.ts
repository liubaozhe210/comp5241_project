import { expect, test } from '@playwright/test';

test('resume assessment report has no text-export or print-to-PDF controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'assessment-report-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'assessment-report-test', aud: 'authenticated', role: 'authenticated', email: 'report@example.test' },
      }),
    );
    const createdAt = new Date().toISOString();
    localStorage.setItem(
      'coursehub.interview.mock.v1',
      JSON.stringify({
        resumes: [],
        assessments: [{
          id: 'assessment-1',
          resumeId: 'resume-1',
          jobTitle: 'Frontend Engineer',
          recommendations: [{
            section: 'Project experience',
            sourceExcerpt: null,
            issue: 'The result is not supported by evidence.',
            rewriteExample: 'Describe a verifiable outcome.',
            reason: 'Specific evidence improves clarity.',
            priority: 'medium',
          }],
          riskFlags: [],
          createdAt,
        }],
        sessions: [],
        reviews: [],
      }),
    );
  });

  await page.goto('/zh/interview/resume/assessment/assessment-1');

  await expect(page.getByRole('heading', { name: 'Frontend Engineer' })).toBeVisible();
  await expect(page.getByText('The result is not supported by evidence.')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载文本报告' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打印 / 另存为 PDF' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '简历评估' })).toBeVisible();
});
