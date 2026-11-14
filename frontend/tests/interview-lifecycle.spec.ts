import { expect, test } from '@playwright/test';

import { mockInterviewApi } from './interview-api';

test('PDF text falls back to OpenRouter vision only after OCR consent', async ({ page }) => {
  await mockInterviewApi(page, { requireOcrConsent: true });

  await page.goto('/zh/interview/resume/assessment');
  await page.getByRole('tab', { name: '上传 PDF / DOCX' }).click();
  await page.getByLabel('选择 PDF 或 DOCX 文件').setInputFiles({
    name: 'resume.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  });
  await page.getByRole('button', { name: '提取文本' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('此 PDF 需要视觉识别');

  await page.getByRole('checkbox', { name: /发送给 OpenRouter 视觉模型/ }).check();
  await page.getByRole('button', { name: '提取文本' }).click();
  await expect(page.getByRole('textbox', { name: '提取文本（可编辑）' }))
    .toHaveValue('这是从 PDF 页面识别出的中文简历文本，可在此处检查和编辑。');
  await expect(page.getByText(/已使用 OpenRouter 视觉模型识别/).first()).toBeVisible();
});

test('resume assessment requires consent and opens the generated report', async ({ page }) => {
  const state = await mockInterviewApi(page);

  await page.goto('/zh/interview/resume/assessment');
  await page.getByLabel('简历名称').fill('Frontend Engineer');
  await page.getByRole('textbox', { name: '目标岗位' }).fill('Frontend Engineer');
  await page.getByRole('textbox', { name: /简历文本/ }).fill(
    'Frontend engineer with five years of React experience, accessibility expertise, and measurable improvements to production workflows.',
  );
  const generate = page.getByRole('button', { name: '保存简历并评估' });
  await generate.click();
  await expect(page.getByText('请先确认隐私说明。')).toBeVisible();
  await page.getByRole('checkbox').check();
  await generate.click();

  await expect(page).toHaveURL(/\/interview\/resume\/assessment\/assessment-\d+$/);
  await expect(page.getByRole('heading', { name: 'Frontend Engineer' })).toBeVisible();
  expect(state.resumes).toHaveLength(1);
  expect(state.assessments).toHaveLength(1);
});

test('active ending discards an unsent draft and abandons a session with no submitted answers', async ({ page }) => {
  const state = await mockInterviewApi(page);

  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入面试间' }).click();
  await page.locator('textarea').fill('这段尚未提交的草稿不能进入面试记录。');
  await page.getByRole('button', { name: '结束并复盘' }).first().click();
  const dialog = page.getByRole('dialog', { name: '结束这次面试？' });
  await expect(dialog).toContainText('当前尚未提交的草稿会被丢弃');
  await dialog.getByRole('button', { name: '结束并复盘' }).click();
  await expect(page.getByRole('main').getByText('面试已结束；由于没有已提交的回答，不生成复盘。')).toBeVisible();

  expect(state.sessions[0].status).toBe('abandoned');
  expect(state.sessions[0].report).toBeNull();
  expect(state.sessions[0].turns.some((turn) => turn.role === 'user' || turn.text.includes('尚未提交'))).toBe(false);
});

test('deleting a resume removes its assessment but keeps and unlinks its interview session', async ({ page }) => {
  const state = await mockInterviewApi(page, { seedResume: true });

  await page.goto('/zh/interview/resume/assessment');
  await expect(page.getByText('Saved resume')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建简历' })).toBeVisible();
  await expect(page.getByText(/This resume has linked interview records/)).toHaveCount(0);
  await page.getByRole('button', { name: '删除简历' }).click();
  const dialog = page.getByRole('dialog', { name: '删除这份简历？' });
  await expect(dialog).toContainText('会保留关联面试记录');
  await dialog.getByRole('button', { name: '删除简历' }).click();
  await expect(page.getByText('Saved resume')).toHaveCount(0);

  expect(state.resumes).toHaveLength(0);
  expect(state.assessments).toHaveLength(0);
  expect(state.sessions).toHaveLength(1);
  expect(state.sessions[0].resume_id).toBeNull();
});
