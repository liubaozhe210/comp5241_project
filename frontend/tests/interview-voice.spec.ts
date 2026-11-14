import { expect, test } from '@playwright/test';

test('device check gates entry, voice answers work, and the final answer opens the synchronous report', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'voice-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'voice-test', aud: 'authenticated', role: 'authenticated', email: 'voice@example.test' },
      }),
    );

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
  await expect.poll(() => page.locator('html').getAttribute('data-last-utterance')).not.toBeNull();
  await expect(page.getByText('剩余', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: '开始语音输入' }).click();
  await page.getByRole('button', { name: '结束语音输入' }).click();
  await expect(page.locator('textarea')).toHaveValue('语音回答内容');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('第 2 / 4 题', { exact: true })).toBeVisible();

  await page.locator('textarea').fill('我先分析问题，再实施并验证结果。');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('第 3 / 4 题', { exact: true })).toBeVisible();

  await page.locator('textarea').fill('我会与团队讨论方案并通过测试验证。');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('第 4 / 4 题', { exact: true })).toBeVisible();

  await page.locator('textarea').fill('我会先处理影响最大的部分并确认效果。');
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page).toHaveURL(/\/interview\/interview\/[^/]+\/report$/);
  await expect(page.getByRole('heading', { name: '练习评分报告' })).toBeVisible();
  await expect(page.getByText('反问', { exact: false })).toHaveCount(0);
});

test('network failure blocks room entry until the check is repeated', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'network-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'network-test', aud: 'authenticated', role: 'authenticated', email: 'network@example.test' },
      }),
    );
    localStorage.setItem('coursehub.interview.mock.v1.fail-next-network', '1');
  });

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

test('ordinary AI failure preserves the submitted answer and a retry does not duplicate it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'answer-retry-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'answer-retry-test', aud: 'authenticated', role: 'authenticated', email: 'answer@example.test' },
      }),
    );
  });

  await page.goto('/zh/interview/interview/config');
  await page.getByLabel('目标岗位').fill('前端工程师');
  await page.getByRole('button', { name: '开始模拟面试' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '进入面试间' }).click();
  await expect(page.getByText('剩余', { exact: false })).toBeVisible();
  await page.locator('textarea').fill('回答已提交，生成下一题失败后可以再次请求。');
  await page.evaluate(() => localStorage.setItem('coursehub.interview.mock.v1.fail-next-ai', '1'));
  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('模拟 AI 暂时不可用。输入已保留，请稍后重试。').first()).toBeVisible();

  let session = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!).sessions[0]);
  expect(session.status).toBe('in_progress');
  expect(session.currentQuestion.index).toBe(1);
  expect(session.turns.filter((turn: { role: string }) => turn.role === 'user')).toHaveLength(1);
  expect(session.turns.find((turn: { role: string }) => turn.role === 'user').text).toContain('回答已提交');

  await page.getByRole('button', { name: '结束答题' }).click();
  await expect(page.getByText('第 2 / 8 题', { exact: true })).toBeVisible();
  session = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!).sessions[0]);
  expect(session.turns.filter((turn: { role: string }) => turn.role === 'user')).toHaveLength(1);
});

test('existing candidate-question sessions are migrated to the completed-question state', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'migration-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'migration-test', aud: 'authenticated', role: 'authenticated', email: 'migration@example.test' },
      }),
    );
    const createdAt = new Date().toISOString();
    localStorage.setItem(
      'coursehub.interview.mock.v1',
      JSON.stringify({
        resumes: [],
        assessments: [],
        questionSets: [],
        sessions: [{
          id: 'legacy-session',
          jobTitle: '前端工程师',
          seniority: 'junior',
          interviewType: 'mixed',
          questionLimit: 4,
          askedCount: 4,
          resumeId: null,
          status: 'in_progress',
          phase: 'candidate_questions',
          turns: [
            { id: 'answer', role: 'user', phase: 'deep_dive', text: '已完成的问题回答', createdAt },
            { id: 'prompt', role: 'assistant', phase: 'candidate_questions', text: '请向面试官提问', createdAt },
            { id: 'candidate-answer', role: 'user', phase: 'candidate_questions', text: '旧的反问内容', createdAt },
          ],
          currentQuestion: { text: '请向面试官提问', phase: 'candidate_questions', index: 5 },
          lastQuestion: { text: '最后一道面试问题', phase: 'deep_dive', index: 4 },
          lastAnswerId: 'answer',
          redoMode: false,
          returnQuestion: null,
          candidateQuestionUsed: true,
          isPartial: false,
          report: null,
          createdAt,
          updatedAt: createdAt,
        }],
        reviews: [],
      }),
    );
  });

  await page.goto('/zh/interview');
  await expect.poll(async () => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!);
    return stored.sessions[0].phase;
  })).toBe('completed');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!).sessions[0]);
  expect(session.currentQuestion).toBeNull();
  expect(session.candidateQuestionUsed).toBeUndefined();
  expect(session.turns.map((turn: { id: string }) => turn.id)).toEqual(['answer']);
});
