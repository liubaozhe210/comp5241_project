import { expect, test } from '@playwright/test';

import { mockInterviewApi } from './interview-api';

test('resume assessment report has no text-export or print-to-PDF controls', async ({ page }) => {
  const state = await mockInterviewApi(page, { seedResume: true });
  Object.assign(state.assessments[0], {
    id: 'assessment-1',
    report: {
      recommendations: [{
        section: 'Project experience',
        source_excerpt: null,
        issue: 'The result is not supported by evidence.',
        rewrite_example: 'Describe a verifiable outcome.',
        reason: 'Specific evidence improves clarity.',
        priority: 'medium',
      }],
      risk_flags: [],
    },
  });

  await page.goto('/zh/interview/resume/assessment/assessment-1');

  await expect(page.getByRole('heading', { name: 'Frontend Engineer' })).toBeVisible();
  await expect(page.getByText('The result is not supported by evidence.')).toBeVisible();
  await expect(page.getByRole('button', { name: '下载文本报告' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '打印 / 另存为 PDF' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '简历评估' })).toBeVisible();
});
