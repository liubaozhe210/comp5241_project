import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type MockTurn = {
  id: string;
  role: 'assistant' | 'user';
  phase: string;
  text: string;
  created_at: string;
  answer_status?: 'answered' | 'skipped';
  score?: number;
  score_breakdown?: {
    correctness: number;
    completeness: number;
    clarity: number;
    relevance: number;
  };
  strengths?: string[];
  improvements?: string[];
};

type MockSession = {
  id: string;
  job_title: string;
  seniority: string;
  interview_type: string;
  question_limit: number;
  asked_count: number;
  resume_id: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  phase: string;
  turns: MockTurn[];
  current_question: { text: string; phase: string; index: number } | null;
  current_turn_id: string | null;
  latest_feedback: string;
  question_deadline_at: string | null;
  report_error_code: string | null;
  report: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type MockResume = {
  id: string;
  title: string;
  text: string;
  source_filename: string | null;
  source_mime: string | null;
  source_size_bytes: number | null;
  job_title: string;
  seniority: string;
  job_description: string;
  created_at: string;
  updated_at: string;
};

type MockReview = {
  id: string;
  source: string;
  source_id: string | null;
  question: string;
  category: string;
  tags: string[];
  answer_framework: string;
  last_answer: string;
  last_score: number | null;
  last_feedback: Record<string, unknown>;
  last_practiced_at: string | null;
  mastery_status: 'pending' | 'mastered';
  created_at: string;
  updated_at: string;
};

type InterviewMockState = {
  resumes: MockResume[];
  assessments: Record<string, unknown>[];
  sessions: MockSession[];
  reviews: MockReview[];
  failNextQuestion: boolean;
  networkFailuresRemaining: number;
};

type InterviewMockOptions = {
  failNextQuestion?: boolean;
  networkFailures?: number;
  seedResume?: boolean;
  seedReviews?: boolean;
  requireOcrConsent?: boolean;
};

const now = () => new Date().toISOString();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');

function supabaseStorageKey() {
  let configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) {
    const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    configuredUrl = envText.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
  }
  if (!configuredUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for Interview Mastery browser tests.');
  return `sb-${new URL(configuredUrl).hostname.split('.')[0]}-auth-token`;
}

function makeSession(input: {
  id: string;
  jobTitle: string;
  resumeId?: string | null;
  questionLimit?: number;
  locale?: string;
}): MockSession {
  const createdAt = now();
  const question = input.locale === 'zh' ? '请做一段简短的自我介绍。' : 'Please give a brief self-introduction.';
  const turnId = `${input.id}-turn-1`;
  return {
    id: input.id,
    job_title: input.jobTitle,
    seniority: 'junior',
    interview_type: 'mixed',
    question_limit: input.questionLimit ?? 4,
    asked_count: 0,
    resume_id: input.resumeId ?? null,
    status: 'in_progress',
    phase: 'introduction',
    turns: [{ id: turnId, role: 'assistant', phase: 'introduction', text: question, created_at: createdAt }],
    current_question: { text: question, phase: 'introduction', index: 1 },
    current_turn_id: turnId,
    latest_feedback: '',
    question_deadline_at: null,
    report_error_code: null,
    report: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function makeReport(session: MockSession) {
  const answered = session.turns.filter((turn) => turn.role === 'user' && turn.answer_status === 'answered');
  for (const turn of answered) {
    turn.score = 72;
    turn.score_breakdown = {
      correctness: 18,
      completeness: 18,
      clarity: 18,
      relevance: 18,
    };
    turn.strengths = ['Clear response.'];
    turn.improvements = ['Add a concrete example.'];
  }
  return {
    overall_score: 72,
    dimensions: {
      communication: { score: 72, summary: 'Clear responses.' },
      technical_depth: { score: 70, summary: 'Relevant detail.' },
      problem_solving: { score: 74, summary: 'Explains decisions.' },
      job_fit: { score: 72, summary: 'Relevant experience.' },
    },
    strengths: ['Clear response.'],
    improvements: ['Add a concrete example.'],
    unanswered_count: session.turns.filter((turn) => turn.role === 'user' && turn.answer_status === 'skipped').length,
    turn_reviews: [],
    created_at: now(),
  };
}

function makeSeedResume(): MockResume {
  const createdAt = now();
  return {
    id: 'resume-seed',
    title: 'Saved resume',
    text: 'Frontend engineer with five years of React experience and a record of building accessible applications.',
    source_filename: null,
    source_mime: null,
    source_size_bytes: null,
    job_title: 'Frontend Engineer',
    seniority: 'junior',
    job_description: '',
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function makeSeedReview(id: string, question: string, masteryStatus: 'pending' | 'mastered'): MockReview {
  const createdAt = now();
  return {
    id,
    source: 'manual',
    source_id: null,
    question,
    category: 'technical',
    tags: [],
    answer_framework: '',
    last_answer: '',
    last_score: null,
    last_feedback: {},
    last_practiced_at: null,
    mastery_status: masteryStatus,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export async function mockInterviewApi(page: Page, options: InterviewMockOptions = {}) {
  const resume = options.seedResume ? makeSeedResume() : null;
  const state: InterviewMockState = {
    resumes: resume ? [resume] : [],
    assessments: resume ? [{
      id: 'assessment-seed',
      resume_id: resume.id,
      job_title: 'Frontend Engineer',
      report: { recommendations: [], risk_flags: [] },
      created_at: now(),
    }] : [],
    sessions: resume ? [makeSession({ id: 'session-seed', jobTitle: 'Frontend Engineer', resumeId: resume.id })] : [],
    reviews: options.seedReviews
      ? [makeSeedReview('pending-review', 'Pending review question', 'pending'),
        makeSeedReview('mastered-review', 'Mastered review question', 'mastered')]
      : [],
    failNextQuestion: options.failNextQuestion ?? false,
    networkFailuresRemaining: options.networkFailures ?? 0,
  };

  await page.addInitScript((storageKey) => {
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: 'interview-e2e-token',
      refresh_token: 'interview-e2e-refresh',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'interview-e2e', aud: 'authenticated', role: 'authenticated', email: 'interview@example.test' },
    }));
  }, supabaseStorageKey());

  await page.route(`${apiBase}/health`, async (route) => {
    const origin = process.env.E2E_BASE_URL
      ? new URL(process.env.E2E_BASE_URL).origin
      : 'http://localhost:3310';
    if (state.networkFailuresRemaining > 0) {
      state.networkFailuresRemaining -= 1;
      await route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': origin },
        body: 'unavailable',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': origin },
      json: { status: 'ok' },
    });
  });

  await page.route(`${apiBase}/auth/me`, async (route) => {
    const origin = process.env.E2E_BASE_URL
      ? new URL(process.env.E2E_BASE_URL).origin
      : 'http://localhost:3310';
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      },
      json: {
        id: 'interview-e2e',
        login_id: 'interview-e2e',
        name: 'Interview Test Student',
        email: 'interview@example.test',
        role: 'student',
        status: 'active',
        locale: 'zh',
      },
    });
  });

  await page.route(`${apiBase}/interview/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = {
      'access-control-allow-origin': process.env.E2E_BASE_URL
        ? new URL(process.env.E2E_BASE_URL).origin
        : 'http://localhost:3310',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    };
    const json = async (value: unknown, status = 200) =>
      route.fulfill({ status, headers, json: clone(value) });

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 200, headers });
      return;
    }
    if (path === '/interview/capabilities' && method === 'GET') {
      await json({ ai_available: true });
      return;
    }
    if (path === '/interview/overview' && method === 'GET') {
      await json({
        resumes: state.resumes.map(({ text: _text, ...item }) => item),
        assessments: state.assessments,
        sessions: state.sessions,
        reviews: state.reviews,
      });
      return;
    }

    const createSessionMatch = path.match(/^\/interview\/sessions$/);
    if (createSessionMatch && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const session = makeSession({
        id: `session-${state.sessions.length + 1}`,
        jobTitle: String(body.job_title ?? ''),
        resumeId: typeof body.resume_id === 'string' ? body.resume_id : null,
        questionLimit: Number(body.question_limit ?? 4),
        locale: String(body.locale ?? 'en'),
      });
      state.sessions.unshift(session);
      await json(session, 201);
      return;
    }

    const sessionMatch = path.match(/^\/interview\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const session = state.sessions.find((item) => item.id === sessionMatch[1]);
      await json(session ?? { code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, session ? 200 : 404);
      return;
    }
    if (sessionMatch && method === 'DELETE') {
      const index = state.sessions.findIndex((item) => item.id === sessionMatch[1]);
      if (index >= 0) state.sessions.splice(index, 1);
      await route.fulfill({ status: 204, headers });
      return;
    }

    const startMatch = path.match(/^\/interview\/sessions\/([^/]+)\/turns\/([^/]+)\/start$/);
    if (startMatch && method === 'POST') {
      const session = state.sessions.find((item) => item.id === startMatch[1]);
      if (!session || session.current_turn_id !== startMatch[2]) {
        await json({ code: 'INTERVIEW_SESSION_STATE_INVALID' }, 409);
        return;
      }
      if (!session.question_deadline_at) {
        session.asked_count += 1;
        session.question_deadline_at = new Date(Date.now() + 300_000).toISOString();
      }
      await json({ turn_id: startMatch[2], status: session.status, question_deadline_at: session.question_deadline_at });
      return;
    }

    const turnsMatch = path.match(/^\/interview\/sessions\/([^/]+)\/turns$/);
    if (turnsMatch && method === 'POST') {
      const session = state.sessions.find((item) => item.id === turnsMatch[1]);
      if (!session || !session.current_question || !session.current_turn_id) {
        await json({ code: 'INTERVIEW_SESSION_STATE_INVALID' }, 409);
        return;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
      const answerStatus = answer ? 'answered' : 'skipped';
      const currentTurn = session.turns.find((turn) => turn.id === session.current_turn_id);
      if (currentTurn && !session.turns.some((turn) => turn.id === `${currentTurn.id}:answer`)) {
        session.turns.push({
          id: `${currentTurn.id}:answer`,
          role: 'user',
          phase: currentTurn.phase,
          text: answer,
          answer_status: answerStatus,
          created_at: now(),
          ...(answer ? { score: 72, strengths: ['Clear response.'], improvements: ['Add a concrete example.'] } : {}),
        });
      }
      if (state.failNextQuestion && session.asked_count < session.question_limit) {
        state.failNextQuestion = false;
        await route.fulfill({
          status: 200,
          headers: { ...headers, 'content-type': 'text/event-stream' },
          body: 'event: error\ndata: {"code":"INTERVIEW_AI_UNAVAILABLE"}\n\n',
        });
        return;
      }
      if (session.asked_count >= session.question_limit) {
        session.status = 'completed';
        session.phase = 'completed';
        session.report = makeReport(session);
        session.current_question = null;
        session.current_turn_id = null;
        session.question_deadline_at = null;
      } else {
        const index = session.asked_count + 1;
        const phase = index === 1 ? 'introduction'
          : index <= 1 + Math.ceil((session.question_limit - 1) / 2) ? 'foundation' : 'deep_dive';
        const turnId = `${session.id}-turn-${index}`;
        const text = body.locale === 'zh' ? `第 ${index} 道面试问题` : `Interview question ${index}`;
        session.phase = phase;
        session.current_turn_id = turnId;
        session.current_question = { text, phase, index };
        session.latest_feedback = 'Thanks for the context.';
        session.question_deadline_at = null;
        session.turns.push({ id: turnId, role: 'assistant', phase, text, created_at: now() });
      }
      session.updated_at = now();
      const data = {
        session,
        status: session.status,
        report: session.report,
      };
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'content-type': 'text/event-stream' },
        body: `event: complete\ndata: ${JSON.stringify(data)}\n\n`,
      });
      return;
    }

    const endMatch = path.match(/^\/interview\/sessions\/([^/]+)\/end$/);
    if (endMatch && method === 'POST') {
      const session = state.sessions.find((item) => item.id === endMatch[1]);
      if (!session) {
        await json({ code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, 404);
        return;
      }
      const hasAnswer = session.turns.some((turn) => turn.role === 'user' && turn.answer_status === 'answered');
      if (hasAnswer) {
        session.status = 'completed';
        session.phase = 'completed';
        session.report = makeReport(session);
      } else {
        session.status = 'abandoned';
      }
      session.current_question = null;
      session.current_turn_id = null;
      session.question_deadline_at = null;
      await json(session);
      return;
    }

    const parseResumeMatch = path.match(/^\/interview\/resumes\/parse$/);
    if (parseResumeMatch && method === 'POST') {
      const body = request.postDataBuffer()?.toString('utf8') ?? '';
      const ocrConsent = /name="ocr_consent"\r\n\r\ntrue/.test(body);
      if (options.requireOcrConsent && !ocrConsent) {
        await json({ code: 'INTERVIEW_OCR_CONSENT_REQUIRED' }, 422);
        return;
      }
      await json({
        text: ocrConsent
          ? '这是从 PDF 页面识别出的中文简历文本，可在此处检查和编辑。'
          : 'Frontend engineer with five years of React experience, accessibility expertise, and measurable improvements to production workflows.',
        source_filename: 'resume.pdf',
        source_mime: 'application/pdf',
        source_size_bytes: 4096,
        ocr_used: ocrConsent,
      });
      return;
    }
    if (path === '/interview/resumes' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const createdAt = now();
      const resume: MockResume = {
        id: `resume-${state.resumes.length + 1}`,
        title: String(body.title ?? ''),
        text: String(body.text ?? ''),
        source_filename: typeof body.source_filename === 'string' ? body.source_filename : null,
        source_mime: typeof body.source_mime === 'string' ? body.source_mime : null,
        source_size_bytes: typeof body.source_size_bytes === 'number' ? body.source_size_bytes : null,
        job_title: String(body.job_title ?? ''),
        seniority: String(body.seniority ?? 'unspecified'),
        job_description: String(body.job_description ?? ''),
        created_at: createdAt,
        updated_at: createdAt,
      };
      state.resumes.unshift(resume);
      await json(resume, 201);
      return;
    }
    const resumeMatch = path.match(/^\/interview\/resumes\/([^/]+)$/);
    if (resumeMatch && method === 'DELETE') {
      const index = state.resumes.findIndex((item) => item.id === resumeMatch[1]);
      if (index >= 0) state.resumes.splice(index, 1);
      state.assessments = state.assessments.filter((item) => item.resume_id !== resumeMatch[1]);
      for (const session of state.sessions) {
        if (session.resume_id === resumeMatch[1]) session.resume_id = null;
      }
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (resumeMatch && method === 'GET') {
      const resume = state.resumes.find((item) => item.id === resumeMatch[1]);
      await json(resume ?? { code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, resume ? 200 : 404);
      return;
    }
    const assessmentMatch = path.match(/^\/interview\/resumes\/([^/]+)\/assessments$/);
    if (assessmentMatch && method === 'POST') {
      const assessment = {
        id: `assessment-${state.assessments.length + 1}`,
        resume_id: assessmentMatch[1],
        job_title: 'Frontend Engineer',
        report: { recommendations: [], risk_flags: [] },
        created_at: now(),
      };
      state.assessments.unshift(assessment);
      await json(assessment, 201);
      return;
    }
    const deleteAssessmentMatch = path.match(/^\/interview\/assessments\/([^/]+)$/);
    if (deleteAssessmentMatch && method === 'DELETE') {
      state.assessments = state.assessments.filter((item) => item.id !== deleteAssessmentMatch[1]);
      await route.fulfill({ status: 204, headers });
      return;
    }

    const reviewMatch = path.match(/^\/interview\/review-items\/([^/]+)$/);
    if (reviewMatch && method === 'PATCH') {
      const item = state.reviews.find((review) => review.id === reviewMatch[1]);
      if (item) item.mastery_status = String((request.postDataJSON() as Record<string, unknown>).mastery_status) as MockReview['mastery_status'];
      await json(item ?? { code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, item ? 200 : 404);
      return;
    }
    if (reviewMatch && method === 'DELETE') {
      state.reviews = state.reviews.filter((item) => item.id !== reviewMatch[1]);
      await route.fulfill({ status: 204, headers });
      return;
    }
    const retryMatch = path.match(/^\/interview\/review-items\/([^/]+)\/retry$/);
    if (retryMatch && method === 'POST') {
      const item = state.reviews.find((review) => review.id === retryMatch[1]);
      if (!item) {
        await json({ code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, 404);
        return;
      }
      item.last_answer = String((request.postDataJSON() as Record<string, unknown>).answer ?? '');
      item.last_score = 82;
      item.last_feedback = {
        strengths: ['Good structure.'],
        improvements: ['Add evidence.'],
        mastery_suggested: true,
      };
      item.last_practiced_at = now();
      item.updated_at = now();
      await json(item);
      return;
    }

    if (path === '/interview/data' && method === 'DELETE') {
      state.resumes = [];
      state.assessments = [];
      state.sessions = [];
      state.reviews = [];
      await route.fulfill({ status: 204, headers });
      return;
    }

    await json({ code: 'INTERVIEW_RESOURCE_NOT_FOUND' }, 404);
  });

  return state;
}

export async function sessionStartRequest(page: Page, id: string) {
  return page.waitForRequest((request) =>
    request.url().includes(`/interview/sessions/${id}/turns/`) && request.url().endsWith('/start'),
  );
}
