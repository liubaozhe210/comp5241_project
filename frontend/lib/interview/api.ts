import { API_BASE, ApiError, apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

import type {
  InterviewDimensionKey,
  InterviewLocale,
  InterviewMockData,
  InterviewReport,
  InterviewSession,
  InterviewTurn,
  Resume,
  ResumeAssessment,
  ResumeLevel,
  ReviewCategory,
  ReviewItem,
  ReviewStatus,
} from './types';
import type { InterviewDraft } from './utils';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function list<T>(value: unknown, mapper: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(mapper) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapResume(value: unknown): Resume {
  const row = record(value);
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    text: String(row.text ?? ''),
    sourceFilename: nullableString(row.source_filename),
    sourceMime: nullableString(row.source_mime),
    sourceSizeBytes: typeof row.source_size_bytes === 'number' ? row.source_size_bytes : null,
    jobTitle: String(row.job_title ?? ''),
    seniority: row.seniority as ResumeLevel,
    jobDescription: String(row.job_description ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapAssessment(value: unknown): ResumeAssessment {
  const row = record(value);
  const report = record(row.report);
  return {
    id: String(row.id ?? ''),
    resumeId: String(row.resume_id ?? ''),
    jobTitle: String(row.job_title ?? ''),
    recommendations: list(report.recommendations, (item) => {
      const recommendation = record(item);
      return {
        section: String(recommendation.section ?? ''),
        sourceExcerpt: nullableString(recommendation.source_excerpt),
        issue: String(recommendation.issue ?? ''),
        rewriteExample: String(recommendation.rewrite_example ?? ''),
        reason: String(recommendation.reason ?? ''),
        priority: recommendation.priority as 'high' | 'medium' | 'low',
      };
    }),
    riskFlags: list(report.risk_flags, (item) => {
      const risk = record(item);
      return {
        category: String(risk.category ?? ''),
        evidence: String(risk.evidence ?? ''),
        suggestion: String(risk.suggestion ?? ''),
      };
    }),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapReport(value: unknown): InterviewReport | null {
  if (!value || typeof value !== 'object') return null;
  const row = record(value);
  const dimensions = record(row.dimensions);
  const dimension = (key: InterviewDimensionKey) => {
    const item = record(dimensions[key]);
    return {
      score: typeof item.score === 'number' ? item.score : null,
      summary: String(item.summary ?? ''),
    };
  };
  return {
    overallScore: typeof row.overall_score === 'number' ? row.overall_score : null,
    dimensions: {
      communication: dimension('communication'),
      technical_depth: dimension('technical_depth'),
      problem_solving: dimension('problem_solving'),
      job_fit: dimension('job_fit'),
    },
    strengths: list(row.strengths, (item) => String(item)),
    improvements: list(row.improvements, (item) => String(item)),
    unansweredCount: typeof row.unanswered_count === 'number' ? row.unanswered_count : 0,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapTurn(value: unknown): InterviewTurn {
  const row = record(value);
  return {
    id: String(row.id ?? ''),
    role: row.role === 'user' ? 'user' : 'assistant',
    phase: row.phase as InterviewTurn['phase'],
    text: String(row.text ?? ''),
    createdAt: String(row.created_at ?? ''),
    ...(row.answer_status === 'answered' || row.answer_status === 'skipped'
      ? { answerStatus: row.answer_status }
      : {}),
    ...(typeof row.score === 'number' ? { score: row.score } : {}),
    ...(Array.isArray(row.strengths) ? { strengths: row.strengths.map(String) } : {}),
    ...(Array.isArray(row.improvements) ? { improvements: row.improvements.map(String) } : {}),
  };
}

function mapSession(value: unknown): InterviewSession {
  const row = record(value);
  const question = record(row.current_question);
  return {
    id: String(row.id ?? ''),
    jobTitle: String(row.job_title ?? ''),
    seniority: row.seniority as ResumeLevel,
    interviewType: row.interview_type as InterviewSession['interviewType'],
    questionLimit: Number(row.question_limit ?? 0),
    askedCount: Number(row.asked_count ?? 0),
    resumeId: nullableString(row.resume_id),
    status: row.status as InterviewSession['status'],
    phase: row.phase as InterviewSession['phase'],
    turns: list(row.turns, mapTurn),
    currentQuestion: typeof question.text === 'string'
      ? {
          text: question.text,
          phase: question.phase as InterviewSession['phase'],
          index: Number(question.index ?? 0),
        }
      : null,
    currentTurnId: nullableString(row.current_turn_id),
    latestFeedback: String(row.latest_feedback ?? ''),
    questionDeadlineAt: nullableString(row.question_deadline_at),
    reportErrorCode: nullableString(row.report_error_code),
    report: mapReport(row.report),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapReview(value: unknown): ReviewItem {
  const row = record(value);
  const feedback = record(row.last_feedback);
  const feedbackLines = [
    ...list(feedback.strengths, (item) => String(item)),
    ...list(feedback.improvements, (item) => String(item)),
  ];
  return {
    id: String(row.id ?? ''),
    source: row.source as ReviewItem['source'],
    sourceId: nullableString(row.source_id),
    question: String(row.question ?? ''),
    category: row.category as ReviewCategory,
    tags: list(row.tags, (item) => String(item)),
    answerFramework: String(row.answer_framework ?? ''),
    lastAnswer: String(row.last_answer ?? ''),
    lastScore: typeof row.last_score === 'number' ? row.last_score : null,
    lastFeedback: feedbackLines.join('\n'),
    masterySuggested: feedback.mastery_suggested === true,
    lastPracticedAt: nullableString(row.last_practiced_at),
    masteryStatus: row.mastery_status as ReviewStatus,
    createdAt: String(row.created_at ?? ''),
  };
}

export async function getInterviewData(): Promise<InterviewMockData> {
  const overview = await apiFetch<JsonRecord>('/interview/overview?limit=50');
  return {
    resumes: list(overview.resumes, mapResume),
    assessments: list(overview.assessments, mapAssessment),
    sessions: list(overview.sessions, mapSession),
    reviews: list(overview.reviews, mapReview),
  };
}

export async function getInterviewCapabilities(): Promise<{ aiAvailable: boolean }> {
  const result = await apiFetch<JsonRecord>('/interview/capabilities');
  return { aiAvailable: Boolean(result.ai_available) };
}

export async function getResume(resumeId: string): Promise<Resume> {
  return mapResume(await apiFetch(`/interview/resumes/${encodeURIComponent(resumeId)}`));
}

export async function parseResumeFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  const parsed = await apiFetch<JsonRecord>('/interview/resumes/parse', { method: 'POST', body: form });
  return {
    text: String(parsed.text ?? ''),
    sourceFilename: nullableString(parsed.source_filename),
    sourceMime: nullableString(parsed.source_mime),
    sourceSizeBytes: typeof parsed.source_size_bytes === 'number' ? parsed.source_size_bytes : null,
  };
}

export async function createResume(input: {
  title: string;
  text: string;
  sourceFilename?: string | null;
  sourceMime?: string | null;
  sourceSizeBytes?: number | null;
  jobTitle?: string;
  seniority?: ResumeLevel;
  jobDescription?: string;
}): Promise<Resume> {
  return mapResume(await apiFetch('/interview/resumes', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      text: input.text,
      source_filename: input.sourceFilename ?? null,
      source_mime: input.sourceMime ?? null,
      source_size_bytes: input.sourceSizeBytes ?? null,
      job_title: input.jobTitle ?? '',
      seniority: input.seniority ?? 'unspecified',
      job_description: input.jobDescription ?? '',
    }),
  }));
}

export async function updateResume(
  resumeId: string,
  input: Parameters<typeof createResume>[0],
): Promise<Resume> {
  return mapResume(await apiFetch(`/interview/resumes/${encodeURIComponent(resumeId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: input.title,
      text: input.text,
      source_filename: input.sourceFilename ?? null,
      source_mime: input.sourceMime ?? null,
      source_size_bytes: input.sourceSizeBytes ?? null,
      job_title: input.jobTitle ?? '',
      seniority: input.seniority ?? 'unspecified',
      job_description: input.jobDescription ?? '',
    }),
  }));
}

export async function createAssessment(
  resumeId: string,
  jobTitle: string,
  locale: InterviewLocale,
): Promise<ResumeAssessment> {
  const result = await apiFetch(
    `/interview/resumes/${encodeURIComponent(resumeId)}/assessments`,
    {
      method: 'POST',
      body: JSON.stringify({ privacy_consent: true, job_title: jobTitle, locale }),
    },
  );
  return mapAssessment(result);
}

export async function deleteResume(resumeId: string): Promise<void> {
  await apiFetch(`/interview/resumes/${encodeURIComponent(resumeId)}`, { method: 'DELETE' });
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  await apiFetch(`/interview/assessments/${encodeURIComponent(assessmentId)}`, { method: 'DELETE' });
}

export async function createInterview(input: InterviewDraft): Promise<InterviewSession> {
  const session = await apiFetch('/interview/sessions', {
    method: 'POST',
    body: JSON.stringify({
      job_title: input.jobTitle,
      seniority: input.seniority,
      interview_type: input.interviewType,
      question_limit: input.questionLimit,
      resume_id: input.resumeId,
      privacy_consent: true,
      locale: input.locale,
    }),
  });
  return mapSession(session);
}

export async function confirmInterviewQuestion(sessionId: string, turnId: string): Promise<void> {
  await apiFetch(
    `/interview/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/start`,
    { method: 'POST', body: '{}' },
  );
}

async function requestStream(
  sessionId: string,
  payload: JsonRecord,
): Promise<InterviewSession> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'UNAUTHORIZED');
  const response = await fetch(
    `${API_BASE}/interview/sessions/${encodeURIComponent(sessionId)}/turns`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as JsonRecord;
    throw new ApiError(response.status, String(body.code ?? `HTTP_${response.status}`), body.detail);
  }
  if (!response.body) throw new ApiError(502, 'INTERVIEW_STREAM_INTERRUPTED');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const eventName = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim();
        const dataLine = frame.match(/^data:\s*(.+)$/m)?.[1];
        if (!eventName || !dataLine) continue;
        const eventData = JSON.parse(dataLine) as JsonRecord;
        if (eventName === 'error') {
          throw new ApiError(502, String(eventData.code ?? 'INTERVIEW_AI_UNAVAILABLE'));
        }
        if (eventName === 'complete') return mapSession(eventData.session);
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  throw new ApiError(502, 'INTERVIEW_STREAM_INTERRUPTED');
}

export async function sendInterviewAnswer(
  sessionId: string,
  turnId: string,
  answer: string,
  locale: InterviewLocale,
  finishReason: 'manual' | 'timeout' = 'manual',
): Promise<InterviewSession> {
  return requestStream(sessionId, {
    turn_id: turnId,
    answer: answer.trim() || null,
    finish_reason: finishReason,
    client_request_id: crypto.randomUUID(),
    locale,
  });
}

export async function finishInterview(
  sessionId: string,
  locale: InterviewLocale,
): Promise<InterviewSession> {
  const result = await apiFetch(
    `/interview/sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ client_request_id: crypto.randomUUID(), locale }),
    },
  );
  return mapSession(result);
}

export async function deleteInterviewSession(sessionId: string): Promise<void> {
  await apiFetch(`/interview/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function createManualReview(input: {
  question: string;
  category: ReviewCategory;
  tags: string[];
  answerFramework: string;
}): Promise<void> {
  await apiFetch('/interview/review-items', {
    method: 'POST',
    body: JSON.stringify({
      question: input.question,
      category: input.category,
      tags: input.tags,
      answer_framework: input.answerFramework,
    }),
  });
}

export async function updateReviewStatus(reviewId: string, status: ReviewStatus): Promise<void> {
  await apiFetch(`/interview/review-items/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ mastery_status: status }),
  });
}

export async function deleteReview(reviewId: string): Promise<void> {
  await apiFetch(`/interview/review-items/${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
}

export async function retryReview(
  reviewId: string,
  answer: string,
  locale: InterviewLocale,
): Promise<ReviewItem> {
  return mapReview(await apiFetch(`/interview/review-items/${encodeURIComponent(reviewId)}/retry`, {
    method: 'POST',
    body: JSON.stringify({ answer, locale }),
  }));
}

export async function clearInterviewData(): Promise<void> {
  await apiFetch('/interview/data', { method: 'DELETE' });
}

export async function checkInterviewNetwork(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    if (!response.ok) throw new Error('INTERVIEW_NETWORK_UNAVAILABLE');
  } catch {
    throw new Error('INTERVIEW_NETWORK_UNAVAILABLE');
  }
}
