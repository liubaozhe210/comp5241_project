import { ApiError, API_BASE } from './api';
import { supabase } from './supabase';

export type Quiz = { question: string; options: string[]; answer?: number; explanation?: string };
export type Scenario = { prompt: string; example_answer?: string; rubric: {label: string; keywords?: string[]}[] };
export type Lesson = {title: string; explanation: string; example: string; source_pages: number[]; quiz: Quiz | null};
export type Content = {title: string; language: 'en' | 'zh'; level: 'beginner' | 'intermediate'; objectives: string[]; lessons: Lesson[]; scenario: Scenario | null};
export type Interactive = {id: string; course_id: string; version: number; revision: number; latest_revision: number; source_name: string; source_page_count: number; content: Content; can_edit: boolean};
export type Progress = {completed: number[]; quizzes: Record<string, {selected: number; correct: boolean; passed: boolean; answer: number; explanation: string; attempts: number}>; scenario: {response: string; example_answer: string; checks: {label: string; matched: boolean}[]} | null};
export const emptyProgress = (): Progress => ({completed: [], quizzes: {}, scenario: null});

export async function downloadSource(id: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE}/interactive/${id}/source`, {
    headers: {Authorization: `Bearer ${data.session?.access_token ?? ''}`}, cache: 'no-store',
  });
  if (!response.ok) throw new ApiError(response.status, (await response.json()).code);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = 'source.pdf'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const en = {
  learningIntro: 'Learn through short lessons, knowledge checks and applied practice.', sourcePages: 'Source pages',
  heading: 'Interactive learning', studio: 'PDF course studio', back: 'Back to course', empty: 'No interactive courses yet.',
  intro: 'Turn your teaching material into short lessons, knowledge checks and applied practice.',
  file: 'Source PDF (up to 20 MB, 100 pages)', goal: 'Teaching goal', language: 'Course language', level: 'Learner level',
  beginner: 'Beginner', intermediate: 'Intermediate', activities: 'Activities', both: 'Knowledge checks + scenario', quiz: 'Knowledge checks', scenario: 'Scenario practice',
  generate: 'Generate course draft', generating: 'Reading the PDF and generating lessons. This can take up to 90 seconds…',
  disclosure: 'Extracted PDF text will be sent to the configured AI service. Review the result against the source before publishing. Image-only PDFs require OCR first.',
  open: 'Open', draft: 'Draft', published: 'Published version', lessons: 'lessons', edit: 'Edit draft', preview: 'Learner preview',
  title: 'Course title', objectives: 'Learning objectives (one per line)', lessonTitle: 'Lesson title', explanation: 'Explanation', example: 'Worked example', pages: 'Source pages (comma-separated)',
  question: 'Question', option: 'Option', correct: 'Correct option', answerExplanation: 'Answer explanation', scenarioPrompt: 'Scenario instructions', exampleAnswer: 'Example answer',
  criterion: 'Checklist criterion', keywords: 'Matching keywords (comma-separated)', save: 'Save draft', publish: 'Publish saved draft', saved: 'Draft saved.',
  publishedOk: 'Published. Students can now open this version.', source: 'Download source PDF', review: 'Check the source, questions and answers before publishing. Saving a draft keeps the published version available to students.',
  dirty: 'Unsaved changes. Save before publishing or previewing.', progress: 'Learning progress', submit: 'Check answer', submitScenario: 'Review response',
  response: 'Your response (at least 30 non-space characters)', checklist: 'Practice checklist: keyword matches are hints, not a grade or factual assessment.',
  complete: 'Complete lesson', completed: 'Completed', passed: 'Correct', retry: 'Try again', loading: 'Loading…', previewNote: 'Teacher preview: responses stay in this session and do not affect student records.',
  archived: 'This parent course is archived. Editing is unavailable.', attempts: 'Attempts', generic: 'The request failed. Please retry.',
  login: 'Please sign in to continue.', stale: 'This page has changed in another session. Reload before editing again.',
  validation: 'Check the form: all text fields, source page numbers, distinct options and a valid answer are required.',
  latest: 'A newer version is available. Reopen the course to start it; progress in this version is preserved.',
  restart: 'Reset preview', refresh: 'Reload saved draft', confirmReload: 'Discard unsaved edits and reload the saved draft?',
};
const zh: typeof en = {
  learningIntro: '通过短课讲解、知识测验与情景练习掌握课程内容。', sourcePages: '来源页码',
  heading: '互动学习', studio: 'PDF 互动课程工作台', back: '返回课程', empty: '暂无互动课程。', intro: '将课件转成短课、知识测验和情景练习。',
  file: 'PDF 原文（最多 20 MB、100 页）', goal: '教学目标', language: '课程语言', level: '学习者水平', beginner: '入门', intermediate: '进阶',
  activities: '互动形式', both: '知识测验 + 情景练习', quiz: '知识测验', scenario: '情景练习', generate: '生成课程草稿',
  generating: '正在读取 PDF 并生成课程，可能需要约 90 秒……', disclosure: '提取的 PDF 文本将发送给已配置的 AI 服务。发布前请对照原文审核；纯扫描件需先完成 OCR 识别。',
  open: '打开', draft: '草稿', published: '已发布版本', lessons: '节课', edit: '编辑草稿', preview: '学生视角预览',
  title: '课程标题', objectives: '学习目标（每行一项）', lessonTitle: '小节标题', explanation: '知识讲解', example: '示例', pages: '来源页码（英文逗号分隔）',
  question: '题目', option: '选项', correct: '正确选项', answerExplanation: '答案解析', scenarioPrompt: '情景任务说明', exampleAnswer: '参考答案',
  criterion: '检查项', keywords: '匹配关键词（英文逗号分隔）', save: '保存草稿', publish: '发布已保存草稿', saved: '草稿已保存。',
  publishedOk: '发布成功，学生现在可以打开此版本。', source: '下载 PDF 原文', review: '请审核来源、题目和答案后再发布。保存草稿时，学生仍可学习之前发布的版本。',
  dirty: '存在未保存修改，请先保存再发布或预览。', progress: '学习进度', submit: '检查答案', submitScenario: '查看反馈', response: '你的回答（至少 30 个非空白字符）',
  checklist: '练习检查表：关键词匹配仅供提示，不代表评分或事实准确性评估。', complete: '完成本节', completed: '已完成', passed: '回答正确', retry: '请再试一次', loading: '加载中……',
  previewNote: '教师预览：回答仅保留在当前页面，不写入学生学习记录。', archived: '所属课程已归档，无法编辑。', attempts: '作答次数', generic: '请求失败，请重试。', login: '请先登录。',
  stale: '内容已在其他页面中更新，请重新加载后再编辑。', validation: '请检查表单：文字不能为空，页码须有效，选项不能重复，且需设置正确答案。',
  latest: '已有新版本。重新打开课程可学习新版；当前版本的进度会保留。', restart: '重置预览', refresh: '重新加载草稿', confirmReload: '放弃未保存修改并重新加载草稿？',
};
export const copy = (locale: string) => locale === 'zh' ? zh : en;

export function interactiveError(error: unknown, locale: string): string {
  const t = copy(locale); const cn = locale === 'zh';
  if (!(error instanceof ApiError)) return t.generic;
  const errors: Record<string, string> = {
    COURSE_AI_NOT_CONFIGURED: cn ? '管理员尚未配置课程生成 AI 服务。' : 'The course generation AI service is not configured.',
    COURSE_AI_KEY_INVALID: cn ? 'AI 服务密钥无效或已失效，请检查后端配置。' : 'The AI service key is invalid or expired. Check the backend configuration.',
    COURSE_AI_CREDIT_LIMIT: cn ? 'AI 账户余额不足或密钥消费上限已达到，请检查服务商的额度设置。' : 'AI credits are insufficient or the key spending limit was reached. Check provider billing.',
    COURSE_AI_RATE_LIMIT: cn ? 'AI 服务请求过于频繁，请稍后重试。' : 'The AI service is rate limited. Please try again later.',
    COURSE_AI_TIMEOUT: cn ? 'AI 服务超时，请重试。' : 'The AI service timed out. Please retry.',
    COURSE_AI_UNAVAILABLE: cn ? 'AI 服务不可用，请检查后端的服务地址、模型和密钥。' : 'AI service unavailable. Check the server endpoint, model and credentials.',
    COURSE_AI_INVALID_OUTPUT: cn ? '生成结果未通过课程校验，请重试或更换课件。' : 'Generated content failed validation. Retry or use a different source.',
    PDF_NO_TEXT: cn ? '未提取到足够文字。扫描件请先做 OCR。' : 'Insufficient text. Scanned PDFs need OCR first.',
    PDF_ENCRYPTED: cn ? '请上传已解除加密的 PDF。' : 'Please upload an unencrypted PDF.',
    PDF_INVALID: cn ? 'PDF 损坏或无法解析。' : 'The PDF is damaged or cannot be parsed.',
    PDF_TOO_MANY_PAGES: cn ? '请将 PDF 拆分为不超过 100 页的文件。' : 'Split the PDF into files of at most 100 pages.',
    PDF_TEXT_TOO_LONG: cn ? '文本超过 60,000 字符，请拆分后上传。' : 'Text exceeds 60,000 characters. Split the PDF first.',
    PDF_TOO_COMPLEX: cn ? 'PDF 页面过于复杂，请简化或拆分文件。' : 'The PDF page is too complex. Simplify or split it.',
    FILE_TOO_LARGE: cn ? '文件超过 20 MB。' : 'The file exceeds 20 MB.', NOT_A_PDF: cn ? '请选择有效的 PDF 文件。' : 'Choose a valid PDF file.',
    INTERACTIVE_EDIT_CONFLICT: t.stale, INTERACTIVE_PROGRESS_CONFLICT: cn ? '另一页面刚更新了进度，请刷新后重试。' : 'Progress changed in another tab. Reload and retry.',
    INVALID_SOURCE_PAGES: t.validation, VALIDATION_FAILED: t.validation, HTTP_422: t.validation,
    COURSE_ARCHIVED: t.archived, COURSE_NOT_PUBLISHED: cn ? '请先发布所属课程。' : 'Publish the parent course first.',
    QUIZ_REQUIRED: cn ? '请先正确回答本节测验。' : 'Pass this lesson’s knowledge check first.',
    SCENARIO_REQUIRED: cn ? '请先提交情景练习。' : 'Submit the scenario response first.',
    SCENARIO_TOO_SHORT: cn ? '请至少填写 30 个非空白字符。' : 'Write at least 30 non-space characters.',
    NOT_COURSE_MEMBER: cn ? '选课审批通过后才能学习互动课程。' : 'Course enrollment must be approved before you can access these lessons.',
    INTERACTIVE_NOT_PUBLISHED: cn ? '课程尚未发布或版本不存在。' : 'The course is unpublished or this version does not exist.',
    NETWORK: cn ? '无法连接后端，请检查网络和服务状态。' : 'Cannot connect to the backend. Check the network and server.',
  };
  if (error.status === 401) return t.login;
  if (error.status === 422 && !errors[error.code]) return t.validation;
  return errors[error.code] ?? `${t.generic} (${error.code})`;
}
