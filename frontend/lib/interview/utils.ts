import type {
  InterviewLocale,
  InterviewPhase,
  InterviewSession,
  InterviewType,
  ResumeLevel,
  ReviewCategory,
} from './types';

const INTERVIEW_DRAFT_KEY = 'coursehub.interview.pending.v1';

export type InterviewDraft = {
  jobTitle: string;
  seniority: ResumeLevel;
  interviewType: InterviewType;
  questionLimit: number;
  resumeId: string | null;
  locale: InterviewLocale;
};

function requireBrowser() {
  if (typeof window === 'undefined') throw new Error('BROWSER_STORAGE_UNAVAILABLE');
}

export function savePendingInterviewDraft(draft: InterviewDraft) {
  requireBrowser();
  window.sessionStorage.setItem(INTERVIEW_DRAFT_KEY, JSON.stringify(draft));
}

export function readPendingInterviewDraft(): InterviewDraft | null {
  requireBrowser();
  const raw = window.sessionStorage.getItem(INTERVIEW_DRAFT_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('INTERVIEW_DRAFT_INVALID');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as InterviewDraft).jobTitle !== 'string' ||
    typeof (parsed as InterviewDraft).questionLimit !== 'number' ||
    !['intern', 'junior', 'mid', 'senior', 'unspecified'].includes((parsed as InterviewDraft).seniority) ||
    !['technical', 'mixed'].includes((parsed as InterviewDraft).interviewType) ||
    !['en', 'zh'].includes((parsed as InterviewDraft).locale) ||
    !((parsed as InterviewDraft).resumeId === null || typeof (parsed as InterviewDraft).resumeId === 'string')
  ) {
    throw new Error('INTERVIEW_DRAFT_INVALID');
  }
  return parsed as InterviewDraft;
}

export function clearPendingInterviewDraft() {
  requireBrowser();
  window.sessionStorage.removeItem(INTERVIEW_DRAFT_KEY);
}

export function formatInterviewError(error: unknown, locale: InterviewLocale) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const zh: Record<string, string> = {
    UNAUTHORIZED: '请先登录后再使用面试精进。',
    FORBIDDEN: '当前账户没有访问面试精进的权限。',
    ACCOUNT_DISABLED: '账户已停用，请联系管理员。',
    NETWORK: '无法连接服务，请检查网络后重试。',
    VALIDATION_FAILED: '提交内容无效，请检查后重试。',
    NOT_FOUND: '找不到这条记录，可能已被删除。',
    INTERVIEW_AI_NOT_CONFIGURED: '面试 AI 服务尚未配置，请联系管理员。',
    INTERVIEW_AI_RATE_LIMITED: 'AI 服务请求过于频繁，请稍后重试。',
    INTERVIEW_AI_INVALID_RESPONSE: 'AI 返回内容无法验证，请保留输入后重试。',
    INTERVIEW_AI_UNAVAILABLE: 'AI 服务暂时不可用；已提交的回答已保存。',
    INTERVIEW_FILE_TOO_LARGE: '文件超过 10 MiB 限制，请选择较小的 PDF 或 DOCX。',
    INTERVIEW_INVALID_FILE: '文件无法读取或没有可提取文本，请重新导出或粘贴简历内容。',
    INTERVIEW_TEXT_TOO_SHORT: '简历文本至少需要 100 个字符。',
    INTERVIEW_TEXT_TOO_LONG: '文本超过 30,000 个字符，请精简后重试。',
    INTERVIEW_ANSWER_INVALID: '请检查输入内容后重试。',
    INTERVIEW_NETWORK_UNAVAILABLE: '无法连接服务。请恢复连接后重新检测。',
    INTERVIEW_DRAFT_INVALID: '面试配置无法读取，请返回配置页重新设置。',
    INTERVIEW_RESOURCE_NOT_FOUND: '找不到这条记录，可能已被删除。',
    INTERVIEW_SESSION_STATE_INVALID: '当前面试状态不允许此操作，请刷新页面。',
    INTERVIEW_GENERATION_IN_PROGRESS: '此会话已有请求正在处理，请稍后刷新查看。',
    INTERVIEW_STREAM_INTERRUPTED: '连接中断。请刷新页面恢复已保存的面试。',
    UNKNOWN: '操作失败，请重试。',
  };
  const en: Record<string, string> = {
    UNAUTHORIZED: 'Sign in to use Interview Mastery.',
    FORBIDDEN: 'This account does not have access to Interview Mastery.',
    ACCOUNT_DISABLED: 'This account is disabled. Contact the administrator.',
    NETWORK: 'The service could not be reached. Check your connection and try again.',
    VALIDATION_FAILED: 'The submitted information is invalid. Check it and try again.',
    NOT_FOUND: 'This record could not be found; it may have been deleted.',
    INTERVIEW_AI_NOT_CONFIGURED: 'Interview AI is not configured. Contact the administrator.',
    INTERVIEW_AI_RATE_LIMITED: 'The AI service is receiving too many requests. Try again shortly.',
    INTERVIEW_AI_INVALID_RESPONSE: 'The AI response could not be validated. Your input is preserved; try again.',
    INTERVIEW_AI_UNAVAILABLE: 'The AI service is temporarily unavailable; submitted answers are preserved.',
    INTERVIEW_FILE_TOO_LARGE: 'The file exceeds 10 MiB. Choose a smaller PDF or DOCX file.',
    INTERVIEW_INVALID_FILE: 'The file is unreadable or has no extractable text. Re-export it or paste the resume text.',
    INTERVIEW_TEXT_TOO_SHORT: 'Resume text must contain at least 100 characters.',
    INTERVIEW_TEXT_TOO_LONG: 'The text exceeds 30,000 characters. Shorten it and try again.',
    INTERVIEW_ANSWER_INVALID: 'Check the input and try again.',
    INTERVIEW_NETWORK_UNAVAILABLE: 'The service could not be reached. Restore your connection and check again.',
    INTERVIEW_DRAFT_INVALID: 'The interview settings could not be read. Return to setup and try again.',
    INTERVIEW_RESOURCE_NOT_FOUND: 'This record could not be found; it may have been deleted.',
    INTERVIEW_SESSION_STATE_INVALID: 'This action is not available in the current interview state. Refresh and try again.',
    INTERVIEW_GENERATION_IN_PROGRESS: 'A request for this session is already processing. Refresh in a moment.',
    INTERVIEW_STREAM_INTERRUPTED: 'The connection was interrupted. Refresh to restore the saved interview.',
    UNKNOWN: 'The operation failed. Please try again.',
  };
  return (locale === 'zh' ? zh : en)[code] ?? (locale === 'zh' ? zh.UNKNOWN : en.UNKNOWN);
}

export function labelForReviewCategory(category: ReviewCategory, locale: InterviewLocale) {
  const zh: Record<ReviewCategory, string> = {
    self_intro: '自我介绍',
    behavioral: '行为面试',
    project_deep_dive: '项目深挖',
    technical: '技术问题',
    pressure: '压力面试',
  };
  const en: Record<ReviewCategory, string> = {
    self_intro: 'Introduction',
    behavioral: 'Behavioral',
    project_deep_dive: 'Project deep-dive',
    technical: 'Technical',
    pressure: 'Pressure question',
  };
  return (locale === 'zh' ? zh : en)[category];
}

export function labelForLevel(level: ResumeLevel, locale: InterviewLocale) {
  const zh: Record<ResumeLevel, string> = {
    intern: '实习',
    junior: '初级',
    mid: '中级',
    senior: '高级',
    unspecified: '未指定',
  };
  const en: Record<ResumeLevel, string> = {
    intern: 'Intern',
    junior: 'Junior',
    mid: 'Mid-level',
    senior: 'Senior',
    unspecified: 'Unspecified',
  };
  return (locale === 'zh' ? zh : en)[level];
}

export function interviewPhaseLabel(phase: InterviewPhase, locale: InterviewLocale) {
  const zh: Record<InterviewPhase, string> = {
    introduction: '自我介绍',
    foundation: '基础考察',
    deep_dive: '经历深挖',
    completed: '题目已完成',
  };
  const en: Record<InterviewPhase, string> = {
    introduction: 'Introduction',
    foundation: 'Fundamentals',
    deep_dive: 'Deep dive',
    completed: 'Questions complete',
  };
  return (locale === 'zh' ? zh : en)[phase];
}

export function interviewStatusLabel(status: InterviewSession['status'], locale: InterviewLocale) {
  const zh: Record<InterviewSession['status'], string> = {
    in_progress: '进行中',
    completed: '已完成',
    abandoned: '已结束',
  };
  const en: Record<InterviewSession['status'], string> = {
    in_progress: 'In progress',
    completed: 'Completed',
    abandoned: 'Ended',
  };
  return (locale === 'zh' ? zh : en)[status];
}
