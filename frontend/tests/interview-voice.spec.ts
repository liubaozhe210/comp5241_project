import { expect, test } from '@playwright/test';

import { mockInterviewApi } from './interview-api';

test('device check gates entry, voice answers work, and the final answer opens the synchronous report', async ({ page }) => {
  await mockInterviewApi(page);
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; length: number }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {}

      stop() {
        this.onresult?.({ results: [{ 0: { transcript: '语音回答内容' }, length: 1 }] });
        this.onend?.();
      }

      abort() {
        this.onend?.();
      }
    }

    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: MockSpeechRecognition });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() {},
        speak(utterance: SpeechSynthesisUtterance) {
          document.documentElement.dataset.lastUtterance = utterance.text;
          window.setTimeout(() => {
            utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
            utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
          }, 0);
        },
      },
    });
  });

  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  const questionLimit = page.locator('input[type="range"]');
  await questionLimit.focus();
  await page.keyboard.press('Home');
  await expect(questionLimit).toHaveValue('4');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await expect(page.getByRole('heading', { name: '设备与网络检测' })).toBeVisible();
  const enterButton = page.getByRole('button', { name: '进入面试间' });
  await expect(enterButton).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(enterButton).toBeEnabled();
  await enterButton.click();
  await expect(page.getByRole('button', { name: '朗读当前问题' })).toHaveCount(0);
  await expect(page.getByText('欢迎参加本次模拟面试。', { exact: false })).toBeVisible();
  await expect.poll(() => page.locator('html').getAttribute('data-last-utterance')).not.toBeNull();
  await expect(page.getByText('剩余', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '开始语音输入' }).click();
  await page.getByRole('button', { name: '结束语音输入' }).click();
  await expect(page.locator('textarea')).toHaveValue('语音回答内容');
  await expect(page.getByText('语音回答已转为文字。')).toBeVisible();
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('第 2 / 4 题', { exact: true })).toBeVisible();
  await expect(page.getByText('面试官反馈：')).toBeVisible();

  for (const index of [2, 3]) {
    await page.locator('textarea').fill(`第 ${index} 题的回答。`);
    await page.getByRole('button', { name: '结束答题' }).click();
    await expect(page.getByText(`第 ${index + 1} / 4 题`, { exact: true })).toBeVisible();
  }

  await page.locator('textarea').fill('我会先处理影响最大的部分并确认效果。');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page).toHaveURL(/\/interview\/interview\/[^/]+\/report$/);
  await expect(page.getByRole('heading', { name: '练习评分报告' })).toBeVisible();
  await expect(page.getByText('反问', { exact: false })).toHaveCount(0);
});

test('network failure blocks room entry until the check is repeated', async ({ page }) => {
  await mockInterviewApi(page, { networkFailures: 1 });
  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await expect(page.getByText('不可用', { exact: true })).toBeVisible();
  const enterButton = page.getByRole('button', { name: '进入面试间' });
  await page.getByRole('checkbox').check();
  await expect(enterButton).toBeDisabled();
  await page.getByRole('button', { name: '重新检测' }).click();
  await expect(page.getByText('已连接', { exact: true })).toBeVisible();
  await expect(enterButton).toBeEnabled();
});

test('ordinary AI failure preserves the submitted answer and exposes a retry action', async ({ page }) => {
  await mockInterviewApi(page, { failNextQuestion: true });

  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入面试间' }).click();
  await expect(page.getByText('剩余', { exact: false })).toBeVisible();
  await page.locator('textarea').fill('回答已提交，生成下一题失败后可以再次请求。');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('AI 服务暂时不可用；已提交的回答已保存。').first()).toBeVisible();
  await expect(page.locator('textarea')).toHaveValue('回答已提交，生成下一题失败后可以再次请求。');
  await expect(page.locator('textarea')).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: '重试生成下一题' }).click();
  await expect(page.getByText('第 2 / 8 题', { exact: true })).toBeVisible();
});
