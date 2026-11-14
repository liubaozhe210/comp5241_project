import type {
  InterviewDimensionKey,
  InterviewLocale,
  InterviewMockData,
  InterviewPhase,
  InterviewQuestion,
  InterviewReport,
  InterviewSession,
  InterviewTurn,
  InterviewType,
  Resume,
  ResumeAssessment,
  ResumeLevel,
  ReviewCategory,
  ReviewItem,
  ReviewStatus,
} from './types';

type LegacyResumeAssessment = ResumeAssessment & {
  overallScore?: number;
  rating?: string;
  dimensions?: unknown;
};

type LegacyReviewAttempt = {
  id: string;
  answer: string;
  score: number;
  feedback: string;
  createdAt: string;
};

type LegacyReviewItem = Omit<
  ReviewItem,
  'source' | 'masteryStatus' | 'lastScore' | 'lastPracticedAt'
> & {
  source: ReviewItem['source'] | 'question_set';
  masteryStatus: ReviewStatus | 'not_reviewed' | 'in_progress';
  attempts?: LegacyReviewAttempt[];
  lastScore?: number | null;
  lastPracticedAt?: string | null;
};

type LegacyInterviewTurn = Omit<InterviewTurn, 'phase'> & {
  phase: InterviewPhase | 'candidate_questions';
};

type LegacyInterviewSession = Omit<
  InterviewSession,
  | 'phase'
  | 'turns'
  | 'status'
  | 'report'
  | 'currentTurnId'
  | 'questionDeadlineAt'
  | 'reportErrorCode'
> & {
  phase: InterviewPhase | 'candidate_questions';
  status: InterviewSession['status'] | 'paused';
  turns: LegacyInterviewTurn[];
  report: (InterviewReport & { isPartial?: boolean }) | null;
  candidateQuestionUsed?: boolean;
  lastQuestion?: InterviewQuestion | null;
  lastAnswerId?: string | null;
  redoMode?: boolean;
  returnQuestion?: InterviewQuestion | null;
  isPartial?: boolean;
  currentTurnId?: string | null;
  questionDeadlineAt?: string | null;
  reportErrorCode?: string | null;
};

type LegacyInterviewMockData = Omit<InterviewMockData, 'reviews' | 'sessions'> & {
  reviews: LegacyReviewItem[];
  sessions: LegacyInterviewSession[];
  questionSets?: unknown;
};

const STORAGE_KEY = 'coursehub.interview.mock.v1';
const FAILURE_KEY = `${STORAGE_KEY}.fail-next-ai`;
const NETWORK_FAILURE_KEY = `${STORAGE_KEY}.fail-next-network`;
const INTERVIEW_DRAFT_KEY = `${STORAGE_KEY}.pending-interview`;

export type InterviewDraft = {
  jobTitle: string;
  seniority: ResumeLevel;
  interviewType: InterviewType;
  questionLimit: number;
  resumeId: string | null;
  locale: InterviewLocale;
};

function id(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function now() {
  return new Date().toISOString();
}

function delay() {
  return new Promise<void>((resolve) => {
    const ms = 500 + Math.floor(Math.random() * 1001);
    window.setTimeout(resolve, ms);
  });
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

export async function checkInterviewNetwork(): Promise<void> {
  requireBrowser();
  await delay();
  if (window.localStorage.getItem(NETWORK_FAILURE_KEY) === '1') {
    window.localStorage.removeItem(NETWORK_FAILURE_KEY);
    throw new Error('INTERVIEW_NETWORK_UNAVAILABLE');
  }
  try {
    const response = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) throw new Error('INTERVIEW_NETWORK_UNAVAILABLE');
  } catch {
    throw new Error('INTERVIEW_NETWORK_UNAVAILABLE');
  }
}

function readStorage(): InterviewMockData {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const initial = createDemoData();
    writeStorage(initial);
    return initial;
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as LegacyInterviewMockData).resumes) ||
    !Array.isArray((parsed as LegacyInterviewMockData).assessments) ||
    !Array.isArray((parsed as LegacyInterviewMockData).sessions) ||
    !Array.isArray((parsed as LegacyInterviewMockData).reviews)
  ) {
    throw new Error('MOCK_DATA_INVALID');
  }
  const data = parsed as LegacyInterviewMockData;
  const hasLegacyAssessmentFields = data.assessments.some(
    (assessment) =>
      'overallScore' in assessment || 'rating' in assessment || 'dimensions' in assessment,
  );
  const assessments = hasLegacyAssessmentFields
    ? data.assessments.map((assessment) => {
      const {
        overallScore: _overallScore,
        rating: _rating,
        dimensions: _dimensions,
        ...report
      } = assessment as LegacyResumeAssessment;
      return report;
    })
    : data.assessments;
  const hasLegacyReviewData = data.reviews.some(
    (item) =>
      item.masteryStatus !== 'pending' &&
      item.masteryStatus !== 'mastered' ||
      'attempts' in item ||
      !('lastScore' in item) ||
      !('lastPracticedAt' in item),
  );
  const hasLegacyCandidatePhase = data.sessions.some(
    (session) => session.phase === 'candidate_questions' || 'candidateQuestionUsed' in session,
  );
  const hasLegacyInterviewData = data.sessions.some(
    (session) =>
      session.status === 'paused' ||
      'lastQuestion' in session ||
      'lastAnswerId' in session ||
      'redoMode' in session ||
      'returnQuestion' in session ||
      'isPartial' in session ||
      !('currentTurnId' in session) ||
      !('questionDeadlineAt' in session) ||
      !('reportErrorCode' in session) ||
      Boolean(session.report && 'isPartial' in session.report),
  );
  const sessions: InterviewSession[] = data.sessions.map((session) => {
    const {
      candidateQuestionUsed: _candidateQuestionUsed,
      lastQuestion: _lastQuestion,
      lastAnswerId: _lastAnswerId,
      redoMode: _redoMode,
      returnQuestion: _returnQuestion,
      isPartial: _isPartial,
      ...current
    } = session;
    const report = session.report
      ? (({ isPartial: _reportIsPartial, ...currentReport }) => currentReport)(session.report)
      : null;
    const phase: InterviewPhase =
      session.phase === 'candidate_questions' ? 'completed' : session.phase;
    return {
      ...current,
      status: session.status === 'paused' ? 'in_progress' : session.status,
      phase,
      currentQuestion: session.phase === 'candidate_questions' ? null : session.currentQuestion,
      turns: session.turns.filter(
        (turn): turn is InterviewTurn => turn.phase !== 'candidate_questions',
      ),
      currentTurnId:
        session.currentTurnId ??
        session.turns.filter((turn) => turn.role === 'assistant').at(-1)?.id ??
        null,
      questionDeadlineAt: session.questionDeadlineAt ?? null,
      reportErrorCode: session.reportErrorCode ?? null,
      report,
    };
  });
  const reviews = data.reviews
    .filter(
      (item): item is LegacyReviewItem & { source: ReviewItem['source'] } =>
        item.source !== 'question_set',
    )
    .map((item): ReviewItem => {
      const { attempts: _attempts, ...current } = item;
      const latestAttempt = item.attempts?.at(-1);
      return {
        ...current,
        masteryStatus: item.masteryStatus === 'mastered' ? 'mastered' : 'pending',
        lastScore: latestAttempt?.score ?? item.lastScore ?? null,
        lastPracticedAt: latestAttempt?.createdAt ?? item.lastPracticedAt ?? null,
        lastAnswer: latestAttempt?.answer ?? item.lastAnswer,
        lastFeedback: latestAttempt?.feedback ?? item.lastFeedback,
      };
    });
  const currentData: InterviewMockData = {
    resumes: data.resumes,
    assessments,
    sessions,
    reviews,
  };
  if (
    'questionSets' in data ||
    reviews.length !== data.reviews.length ||
    hasLegacyReviewData ||
    hasLegacyAssessmentFields ||
    hasLegacyCandidatePhase ||
    hasLegacyInterviewData
  ) {
    writeStorage(currentData);
  }
  return currentData;
}

function writeStorage(data: InterviewMockData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function requireBrowser() {
  if (typeof window === 'undefined') throw new Error('BROWSER_STORAGE_UNAVAILABLE');
}

function consumeAiFailure() {
  const shouldFail = window.localStorage.getItem(FAILURE_KEY) === '1';
  if (shouldFail) {
    window.localStorage.removeItem(FAILURE_KEY);
    throw new Error('INTERVIEW_AI_UNAVAILABLE');
  }
}

async function mutate<T>(update: (data: InterviewMockData) => T): Promise<T> {
  requireBrowser();
  await delay();
  const data = readStorage();
  const result = update(data);
  writeStorage(data);
  return result;
}

function makeResume(): Resume {
  const createdAt = now();
  return {
    id: 'resume-demo',
    title: 'Alex Chen — Frontend Engineer',
    text:
      'Alex Chen\nFrontend Engineer | React, TypeScript, accessibility\n\n' +
      'EDUCATION\nBSc Computer Science, City University, 2022–2026\n\n' +
      'PROJECT EXPERIENCE\nCampus Events Dashboard | React, TypeScript, Node.js\n' +
      'Built a responsive event dashboard used by student societies. Reworked the search and filtering flow, ' +
      'added keyboard navigation, and wrote reusable components with documented props. Worked with three teammates ' +
      'using weekly reviews and issue tracking. Reduced repeated UI code and improved the consistency of event pages.\n\n' +
      'EXPERIENCE\nWeb Development Intern | Northstar Studio | Summer 2025\n' +
      'Implemented landing-page components, fixed responsive layout defects, and reviewed pull requests with a mentor.\n\n' +
      'SKILLS\nReact, TypeScript, JavaScript, HTML, CSS, Git, REST APIs, unit testing',
    sourceFilename: null,
    sourceMime: null,
    sourceSizeBytes: null,
    jobTitle: 'Frontend Engineer',
    seniority: 'junior',
    jobDescription: 'Build accessible web experiences with React and TypeScript.',
    createdAt,
    updatedAt: createdAt,
  };
}

function makeAssessment(resumeId: string): ResumeAssessment {
  return {
    id: 'assessment-demo',
    resumeId,
    jobTitle: 'Frontend Engineer',
    recommendations: [
      {
        section: 'Campus Events Dashboard',
        sourceExcerpt: 'Reduced repeated UI code and improved the consistency of event pages.',
        issue: 'The outcome is useful but does not state how it was observed.',
        rewriteExample:
          'Standardized repeated event-page components and documented their props so three teammates could reuse the same patterns.',
        reason: 'Connects the change to a concrete team workflow without inventing a metric.',
        priority: 'high',
      },
      {
        section: 'Web Development Intern',
        sourceExcerpt: 'Implemented landing-page components, fixed responsive layout defects...',
        issue: 'The bullet lists tasks but does not identify a challenging contribution.',
        rewriteExample:
          'Implemented responsive landing-page components and resolved layout defects across target screen sizes; add a verified example of a defect or result if available.',
        reason: 'Shows scope and invites a real, verifiable example rather than a fabricated claim.',
        priority: 'medium',
      },
    ],
    riskFlags: [
      {
        category: 'Evidence gap',
        evidence: 'The resume describes improved consistency but does not state how it was measured.',
        suggestion: 'If available, add a real example such as fewer duplicate components or clearer review feedback.',
      },
    ],
    createdAt: now(),
  };
}

function makeSession(): InterviewSession {
  const createdAt = now();
  const intro: InterviewQuestion = {
    text: 'Please introduce yourself and highlight the experience most relevant to frontend engineering.',
    phase: 'introduction',
    index: 1,
  };
  return {
    id: 'interview-demo',
    jobTitle: 'Frontend Engineer',
    seniority: 'junior',
    interviewType: 'mixed',
    questionLimit: 8,
    askedCount: 1,
    resumeId: 'resume-demo',
    status: 'completed',
    phase: 'completed',
    turns: [
      {
        id: 'turn-demo-1',
        role: 'assistant',
        phase: 'introduction',
        text: intro.text,
        createdAt,
      },
      {
        id: 'turn-demo-2',
        role: 'user',
        phase: 'introduction',
        text: 'I am a computer science graduate focused on frontend development. I built a React and TypeScript event dashboard and improved keyboard navigation.',
        score: 76,
        strengths: ['Relevant experience is stated clearly.'],
        improvements: ['Add one specific challenge and outcome.'],
        createdAt,
      },
      {
        id: 'turn-demo-3',
        role: 'assistant',
        phase: 'foundation',
        text: 'Good role focus. Next, how would you make a search and filter interface usable with a keyboard?',
        createdAt,
      },
      {
        id: 'turn-demo-4',
        role: 'user',
        phase: 'foundation',
        text: 'I would ensure the controls are reachable in a logical order, have visible focus, and expose labels and state to assistive technology.',
        score: 82,
        strengths: ['Covers focus, order, and accessible control state.'],
        improvements: ['Mention how you would test the behavior.'],
        createdAt,
      },
    ],
    currentQuestion: null,
    currentTurnId: null,
    questionDeadlineAt: null,
    reportErrorCode: null,
    report: {
      overallScore: 79,
      dimensions: {
        communication: { score: 78, summary: 'Clear and relevant; add more concise evidence.' },
        technical_depth: { score: 80, summary: 'Good accessibility fundamentals; include testing details.' },
        problem_solving: { score: 76, summary: 'Explains approach; could compare alternatives.' },
        job_fit: { score: 82, summary: 'Experience aligns with an entry-level frontend role.' },
      },
      strengths: ['Connects project experience to the target role.', 'Explains practical accessibility considerations.'],
      improvements: ['Add concrete examples and verified outcomes.', 'Describe how implementation decisions were tested.'],
      createdAt,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function makeReview(): ReviewItem {
  return {
    id: 'review-demo',
    source: 'mock_interview',
    sourceId: 'interview-demo',
    question: 'How would you measure whether a reusable component improved the team workflow?',
    category: 'project_deep_dive',
    tags: ['measurement', 'collaboration'],
    answerFramework: 'State what was observed, distinguish evidence from assumptions, and propose a measurable follow-up.',
    lastAnswer: 'It made the code cleaner and easier to use.',
    lastScore: null,
    lastFeedback: 'Give a concrete example of what changed, and avoid claiming impact you did not measure.',
    lastPracticedAt: null,
    masteryStatus: 'pending',
    createdAt: now(),
  };
}

function createDemoData(): InterviewMockData {
  const resume = makeResume();
  const session = makeSession();
  return {
    resumes: [resume],
    assessments: [makeAssessment(resume.id)],
    sessions: [session],
    reviews: [makeReview()],
  };
}

export async function getInterviewData(options: { delay?: boolean } = {}): Promise<InterviewMockData> {
  requireBrowser();
  if (options.delay !== false) await delay();
  return readStorage();
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
  return mutate((data) => {
    const text = input.text.trim();
    if (text.length < 100) throw new Error('INTERVIEW_TEXT_TOO_SHORT');
    if (text.length > 30_000) throw new Error('INTERVIEW_TEXT_TOO_LONG');
    const createdAt = now();
    const resume: Resume = {
      id: id('resume'),
      title: input.title.trim() || `Resume ${new Date().toLocaleDateString()}`,
      text,
      sourceFilename: input.sourceFilename ?? null,
      sourceMime: input.sourceMime ?? null,
      sourceSizeBytes: input.sourceSizeBytes ?? null,
      jobTitle: input.jobTitle?.trim() ?? '',
      seniority: input.seniority ?? 'unspecified',
      jobDescription: input.jobDescription?.trim() ?? '',
      createdAt,
      updatedAt: createdAt,
    };
    data.resumes.unshift(resume);
    return resume;
  });
}

export async function createAssessment(
  resumeId: string,
  jobTitle: string,
  locale: InterviewLocale,
): Promise<ResumeAssessment> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const resume = data.resumes.find((item) => item.id === resumeId);
  if (!resume) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  const assessment = makeAssessment(resumeId);
  assessment.id = id('assessment');
  assessment.jobTitle = jobTitle.trim() || resume.jobTitle || (locale === 'zh' ? '未指定岗位' : 'General role');
  assessment.createdAt = now();
  if (locale === 'zh') {
    assessment.recommendations[0].issue = '这项成果有价值，但没有说明如何观察或验证。';
    assessment.recommendations[0].rewriteExample =
      '统一重复的活动页面组件并补充 props 文档，方便三位队友复用相同模式。';
    assessment.recommendations[0].reason = '把修改与具体团队流程联系起来，同时不虚构指标。';
    assessment.recommendations[1].issue = '经历描述了工作内容，但没有指出具体的难点或贡献。';
    assessment.recommendations[1].rewriteExample =
      '实现响应式落地页组件并修复多个屏幕尺寸下的布局问题；如有真实案例，可补充已验证的结果。';
    assessment.recommendations[1].reason = '明确工作范围，并鼓励补充真实案例，而不是编造结果。';
    assessment.riskFlags[0] = {
      category: '证据缺口',
      evidence: '简历提到一致性提升，但未说明如何衡量。',
      suggestion: '如有真实依据，可补充重复组件减少或代码评审反馈改善等例子。',
    };
  }
  data.assessments.unshift(assessment);
  writeStorage(data);
  return assessment;
}

function findOrCreateReview(
  data: InterviewMockData,
  input: Omit<ReviewItem, 'id' | 'createdAt' | 'masteryStatus'>,
) {
  const existing = data.reviews.find((item) => item.source === input.source && item.sourceId === input.sourceId);
  if (existing) {
    Object.assign(existing, input);
    existing.masteryStatus = 'pending';
    return existing;
  }
  const review: ReviewItem = {
    ...input,
    id: id('review'),
    masteryStatus: 'pending',
    createdAt: now(),
  };
  data.reviews.unshift(review);
  return review;
}

export async function createInterview(input: InterviewDraft): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  const data = readStorage();
  if (input.resumeId && !data.resumes.some((resume) => resume.id === input.resumeId)) {
    throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  }
  const openingText =
    input.locale === 'zh'
      ? '欢迎参加本次模拟面试。流程包括自我介绍、基础考察和经历/技术深挖；每题限时 5 分钟。你可以文字作答或使用可选语音听写，也可以随时主动结束。'
      : 'Welcome to this mock interview. We will cover an introduction, fundamentals, and a deeper dive; each question has a five-minute limit. You can type or use optional voice dictation, and may end the interview at any time.';
  const introText =
    input.locale === 'zh'
      ? '请做一段简短的自我介绍。'
      : 'Please give a brief self-introduction.';
  const createdAt = now();
  const openingTurnId = id('turn');
  const questionTurnId = id('turn');
  const firstQuestion: InterviewQuestion = {
    text: introText,
    phase: 'introduction',
    index: 1,
  };
  const session: InterviewSession = {
    id: id('interview'),
    jobTitle: input.jobTitle.trim(),
    seniority: input.seniority,
    interviewType: input.interviewType,
    questionLimit: input.questionLimit,
    askedCount: 1,
    resumeId: input.resumeId,
    status: 'in_progress',
    phase: 'introduction',
    turns: [
      {
        id: openingTurnId,
        role: 'assistant',
        phase: 'introduction',
        text: openingText,
        createdAt,
      },
      {
        id: questionTurnId,
        role: 'assistant',
        phase: 'introduction',
        text: introText,
        createdAt,
      },
    ],
    currentQuestion: firstQuestion,
    currentTurnId: questionTurnId,
    questionDeadlineAt: null,
    reportErrorCode: null,
    report: null,
    createdAt,
    updatedAt: createdAt,
  };
  data.sessions.unshift(session);
  writeStorage(data);
  return session;
}

function nextQuestion(
  session: InterviewSession,
  locale: InterviewLocale,
): InterviewQuestion {
  const index = session.askedCount + 1;
  const foundationLimit = Math.ceil((session.questionLimit - 1) / 2);
  const phase: InterviewPhase = index <= foundationLimit + 1 ? 'foundation' : 'deep_dive';
  const zhQuestions = [
    '请讲一次你解决复杂问题的经历，并说明你如何验证结果。',
    '在项目中遇到意见分歧时，你如何推动团队做出决定？',
    '如果要改进你刚才提到的项目，你会先做什么？',
    '你会如何测试这个功能并处理边界情况？',
  ];
  const enQuestions = [
    'Tell me about a complex problem you solved and how you verified the result.',
    'How have you helped a team reach a decision when opinions differed?',
    'If you could improve the project you mentioned, what would you do first?',
    'How would you test this feature and handle edge cases?',
  ];
  const questionIndex = Math.max(0, (index - 2) % zhQuestions.length);
  const text = locale === 'zh' ? zhQuestions[questionIndex] : enQuestions[questionIndex];
  return { text, phase, index };
}

function makeReviewFromAnswer(
  data: InterviewMockData,
  session: InterviewSession,
  question: InterviewQuestion,
  answer: string,
  feedback: string,
  score: number,
) {
  const sourceId = `${session.id}:${question.index}`;
  const existing = data.reviews.find(
    (item) => item.source === 'mock_interview' && item.sourceId === sourceId,
  );
  if (score >= 60) {
    if (existing) {
      existing.lastAnswer = answer;
      existing.lastScore = score;
      existing.lastFeedback = feedback;
      existing.lastPracticedAt = now();
      existing.masteryStatus = score >= 80 ? 'mastered' : 'pending';
    }
    return;
  }
  findOrCreateReview(data, {
    source: 'mock_interview',
    sourceId,
    question: question.text,
    category: question.phase === 'introduction' ? 'self_intro' : question.phase === 'foundation' ? 'behavioral' : 'project_deep_dive',
    tags: ['mock interview', session.jobTitle],
    answerFramework: 'State the context, your specific action, the result, and what you learned. Use only verifiable facts.',
    lastAnswer: answer,
    lastScore: score,
    lastFeedback: feedback,
    lastPracticedAt: now(),
  });
}

export async function sendInterviewAnswer(
  sessionId: string,
  answer: string,
  locale: InterviewLocale,
  finishReason: 'manual' | 'timeout' = 'manual',
): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  const data = readStorage();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || session.status !== 'in_progress' || !session.currentQuestion) {
    throw new Error('INTERVIEW_SESSION_STATE_INVALID');
  }
  const question = session.currentQuestion;
  const isExpiredManualSubmit =
    finishReason === 'manual' &&
    session.questionDeadlineAt !== null &&
    Date.now() >= Date.parse(session.questionDeadlineAt);
  const cleanAnswer = isExpiredManualSubmit ? '' : answer.trim();
  if (cleanAnswer.length > 8_000) throw new Error('INTERVIEW_ANSWER_INVALID');
  const createdAt = now();
  const hasAnswer = cleanAnswer.length > 0;
  const score = hasAnswer ? Math.max(42, Math.min(96, 48 + (cleanAnswer.length % 49))) : undefined;
  const feedback = !hasAnswer
    ? locale === 'zh' ? '本题未作答，继续下一题。' : 'No answer was submitted. Let’s continue.'
    : locale === 'zh'
      ? (score ?? 0) < 60
        ? '你已经给出了方向；再补充一个具体行动和可验证的结果会更有说服力。'
        : '回答重点清楚；可以再用一个具体例子说明你的个人贡献。'
      : (score ?? 0) < 60
        ? 'You have a useful starting point; add one specific action and a verifiable outcome.'
        : 'Your main point is clear; one concrete example would make your contribution stronger.';
  const userTurn: InterviewTurn = {
    id: id('turn'),
    role: 'user',
    phase: question.phase,
    text: cleanAnswer,
    createdAt,
    answerStatus: hasAnswer ? 'answered' : 'skipped',
    ...(score === undefined ? {} : {
      score,
      strengths: [locale === 'zh' ? '回答切题，表达了相关思路。' : 'The response addresses the prompt with a relevant approach.'],
      improvements: [locale === 'zh' ? '补充个人行动和结果证据。' : 'Add your specific action and evidence of the outcome.'],
    }),
  };

  const pendingAnswer = session.turns.at(-1);
  if (
    pendingAnswer?.role === 'user' &&
    session.turns.at(-2)?.id === session.currentTurnId
  ) {
    Object.assign(pendingAnswer, userTurn, { id: pendingAnswer.id });
  } else {
    session.turns.push(userTurn);
  }

  if (hasAnswer && question.phase !== 'introduction') {
    makeReviewFromAnswer(data, session, question, cleanAnswer, feedback, score ?? 0);
  }
  session.questionDeadlineAt = null;

  if (question.index >= session.questionLimit) {
    session.phase = 'completed';
    session.currentQuestion = null;
    session.currentTurnId = null;
    try {
      consumeAiFailure();
    } catch (error) {
      session.status = 'abandoned';
      session.reportErrorCode = error instanceof Error ? error.message : 'INTERVIEW_AI_UNAVAILABLE';
      session.updatedAt = now();
      writeStorage(data);
      throw new Error('INTERVIEW_REPORT_GENERATION_FAILED');
    }
    session.report = makeReport(session, locale);
    session.status = 'completed';
    session.reportErrorCode = null;
  } else {
    try {
      consumeAiFailure();
    } catch (error) {
      session.updatedAt = now();
      writeStorage(data);
      throw error;
    }
    const next = nextQuestion(session, locale);
    const assistantTurnId = id('turn');
    session.turns.push({
      id: assistantTurnId,
      role: 'assistant',
      phase: next.phase,
      text: `${feedback}\n\n${next.text}`,
      createdAt: now(),
    });
    session.currentQuestion = next;
    session.currentTurnId = assistantTurnId;
    session.askedCount = next.index;
    session.phase = next.phase;
  }
  session.updatedAt = now();
  writeStorage(data);
  return session;
}

export async function confirmInterviewQuestion(sessionId: string, turnId: string): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  const data = readStorage();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (
    !session ||
    session.status !== 'in_progress' ||
    !session.currentQuestion ||
    session.currentTurnId !== turnId
  ) {
    throw new Error('INTERVIEW_SESSION_STATE_INVALID');
  }
  if (!session.questionDeadlineAt) {
    session.questionDeadlineAt = new Date(Date.now() + 300_000).toISOString();
    session.updatedAt = now();
    writeStorage(data);
  }
  return session;
}

function makeReport(session: InterviewSession, locale: InterviewLocale): InterviewReport {
  const answers = session.turns.filter(
    (turn) =>
      turn.role === 'user' &&
      !turn.superseded &&
      turn.answerStatus !== 'skipped' &&
      turn.text.trim().length > 0,
  );
  const average = answers.length
    ? Math.round(answers.reduce((sum, turn) => sum + (turn.score ?? 65), 0) / answers.length)
    : null;
  const communication = average === null ? null : Math.max(0, Math.min(100, average - 2));
  const technical = average === null ? null : Math.max(0, Math.min(100, average + 2));
  const summary =
    answers.length === 0
      ? locale === 'zh' ? '没有足够的回答证据评估此维度。' : 'There is not enough answer evidence to score this dimension.'
      : locale === 'zh'
        ? '这是基于已提交回答生成的本地模拟复盘。请补充具体案例并说明如何验证结果。'
        : 'This mock review is based on submitted answers. Add concrete examples and explain how you verified outcomes.';
  const dimension = (score: number | null) => ({ score, summary });
  return {
    overallScore: average,
    dimensions: {
      communication: dimension(communication),
      technical_depth: dimension(technical),
      problem_solving: dimension(average),
      job_fit: dimension(average),
    },
    strengths: locale === 'zh'
      ? ['你完成了本次练习流程。', '回答记录已保存，可逐题复盘。']
      : ['You completed the practice flow.', 'Your answers are available for review.'],
    improvements: locale === 'zh'
      ? ['补充具体案例和个人行动。', '用可核验的证据支持结果。']
      : ['Add a specific example and your individual action.', 'Support outcomes with verifiable evidence.'],
    createdAt: now(),
  };
}

export async function finishInterview(
  sessionId: string,
  locale: InterviewLocale,
): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  const data = readStorage();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || session.status !== 'in_progress') {
    throw new Error('INTERVIEW_SESSION_STATE_INVALID');
  }
  const answeredCount = session.turns.filter(
    (turn) =>
      turn.role === 'user' &&
      !turn.superseded &&
      turn.answerStatus !== 'skipped' &&
      turn.text.trim().length > 0,
  ).length;
  session.currentQuestion = null;
  session.currentTurnId = null;
  session.questionDeadlineAt = null;
  session.phase = 'completed';
  session.updatedAt = now();
  if (answeredCount === 0) {
    session.status = 'abandoned';
    session.report = null;
    session.reportErrorCode = null;
    writeStorage(data);
    return session;
  }
  try {
    consumeAiFailure();
  } catch (error) {
    session.status = 'abandoned';
    session.reportErrorCode = error instanceof Error ? error.message : 'INTERVIEW_AI_UNAVAILABLE';
    writeStorage(data);
    throw new Error('INTERVIEW_REPORT_GENERATION_FAILED');
  }
  session.report = makeReport(session, locale);
  session.status = 'completed';
  session.reportErrorCode = null;
  writeStorage(data);
  return session;
}

export async function deleteResume(resumeId: string): Promise<void> {
  await mutate((data) => {
    if (!data.resumes.some((item) => item.id === resumeId)) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
    data.resumes = data.resumes.filter((item) => item.id !== resumeId);
    data.assessments = data.assessments.filter((item) => item.resumeId !== resumeId);
    data.sessions.forEach((session) => {
      if (session.resumeId === resumeId) session.resumeId = null;
    });
  });
}

export async function deleteAssessment(assessmentId: string): Promise<void> {
  await mutate((data) => {
    data.assessments = data.assessments.filter((item) => item.id !== assessmentId);
  });
}

export async function deleteInterviewSession(sessionId: string): Promise<void> {
  await mutate((data) => {
    data.sessions = data.sessions.filter((session) => session.id !== sessionId);
    const deletedReviewIds = new Set(
      data.reviews
        .filter((item) => item.source === 'mock_interview' && item.sourceId?.startsWith(`${sessionId}:`))
        .map((item) => item.id),
    );
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      for (const item of data.reviews) {
        if (item.sourceId && deletedReviewIds.has(item.sourceId) && !deletedReviewIds.has(item.id)) {
          deletedReviewIds.add(item.id);
          foundChild = true;
        }
      }
    }
    data.reviews = data.reviews.filter((item) => !deletedReviewIds.has(item.id));
  });
}

export async function createManualReview(input: {
  question: string;
  category: ReviewCategory;
  tags: string[];
  answerFramework: string;
}): Promise<void> {
  await mutate((data) => {
    if (!input.question.trim()) throw new Error('INTERVIEW_ANSWER_INVALID');
    data.reviews.unshift({
      id: id('review'),
      source: 'manual',
      sourceId: null,
      question: input.question.trim(),
      category: input.category,
      tags: input.tags,
      answerFramework: input.answerFramework.trim(),
      lastAnswer: '',
      lastScore: null,
      lastFeedback: '',
      lastPracticedAt: null,
      masteryStatus: 'pending',
      createdAt: now(),
    });
  });
}

export async function updateReviewStatus(reviewId: string, status: ReviewStatus): Promise<void> {
  await mutate((data) => {
    const item = data.reviews.find((entry) => entry.id === reviewId);
    if (!item) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
    item.masteryStatus = status;
  });
}

export async function deleteReview(reviewId: string): Promise<void> {
  await mutate((data) => {
    data.reviews = data.reviews.filter((item) => item.id !== reviewId);
  });
}

export async function retryReview(
  reviewId: string,
  answer: string,
  locale: InterviewLocale,
): Promise<ReviewItem> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const item = data.reviews.find((entry) => entry.id === reviewId);
  if (!item) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  if (!answer.trim()) throw new Error('INTERVIEW_ANSWER_INVALID');
  const score = Math.max(45, Math.min(96, 50 + (answer.trim().length % 47)));
  const feedback =
    locale === 'zh'
      ? score >= 80
        ? '本次回答结构清晰。你可以检查是否已经能独立、稳定地说明证据。'
        : '请补充具体行动、决策依据和结果；不要编造未测量的数据。'
      : score >= 80
        ? 'This answer is well structured. Check whether you can explain the evidence consistently on your own.'
        : 'Add specific actions, reasoning, and outcomes; do not invent unmeasured data.';
  item.lastScore = score;
  item.lastAnswer = answer.trim();
  item.lastFeedback = feedback;
  item.lastPracticedAt = now();
  item.masteryStatus = score >= 80 ? 'mastered' : 'pending';
  writeStorage(data);
  return item;
}

export async function clearInterviewData(): Promise<void> {
  await mutate((data) => {
    data.resumes = [];
    data.assessments = [];
    data.sessions = [];
    data.reviews = [];
  });
}

export async function resetInterviewDemoData(): Promise<void> {
  requireBrowser();
  await delay();
  writeStorage(createDemoData());
}

export function simulateNextAiFailure() {
  requireBrowser();
  window.localStorage.setItem(FAILURE_KEY, '1');
}

export function simulateNextNetworkFailure() {
  requireBrowser();
  window.localStorage.setItem(NETWORK_FAILURE_KEY, '1');
}

export function isAiFailure(error: unknown) {
  return error instanceof Error &&
    (error.message === 'INTERVIEW_AI_UNAVAILABLE' || error.message === 'INTERVIEW_REPORT_GENERATION_FAILED');
}

export function formatMockError(error: unknown, locale: InterviewLocale) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const zh: Record<string, string> = {
    INTERVIEW_AI_UNAVAILABLE: '模拟 AI 暂时不可用。输入已保留，请稍后重试。',
    INTERVIEW_REPORT_GENERATION_FAILED: '复盘生成失败，已提交的回答已保留；原型版本不支持重试。',
    INTERVIEW_NETWORK_UNAVAILABLE: '网络检测失败。请恢复连接后重新检测。',
    INTERVIEW_DRAFT_INVALID: '面试配置无法读取，请返回配置页重新设置。',
    INTERVIEW_TEXT_TOO_SHORT: '文本太短，请至少输入 100 个字符。',
    INTERVIEW_TEXT_TOO_LONG: '文本超过 30,000 个字符，请精简后重试。',
    INTERVIEW_ANSWER_INVALID: '请检查输入内容后重试。',
    INTERVIEW_RESOURCE_NOT_FOUND: '找不到这条模拟记录，可能已被删除。',
    INTERVIEW_SESSION_STATE_INVALID: '当前面试状态不允许此操作，请刷新页面。',
    MOCK_DATA_INVALID: '本地模拟数据格式无法读取，请恢复演示数据。',
    BROWSER_STORAGE_UNAVAILABLE: '浏览器本地存储不可用，无法保存模拟数据。',
    UNKNOWN: '操作失败，请重试。',
  };
  const en: Record<string, string> = {
    INTERVIEW_AI_UNAVAILABLE: 'Mock AI is temporarily unavailable. Your input is preserved; try again.',
    INTERVIEW_REPORT_GENERATION_FAILED: 'The review could not be generated. Submitted answers are preserved; this prototype does not support report retries.',
    INTERVIEW_NETWORK_UNAVAILABLE: 'Network check failed. Restore your connection and check again.',
    INTERVIEW_DRAFT_INVALID: 'The interview settings could not be read. Return to setup and try again.',
    INTERVIEW_TEXT_TOO_SHORT: 'The text is too short. Enter at least 100 characters.',
    INTERVIEW_TEXT_TOO_LONG: 'The text exceeds 30,000 characters. Shorten it and try again.',
    INTERVIEW_ANSWER_INVALID: 'Check the input and try again.',
    INTERVIEW_RESOURCE_NOT_FOUND: 'This mock record could not be found; it may have been deleted.',
    INTERVIEW_SESSION_STATE_INVALID: 'This action is not available in the current interview state. Refresh and try again.',
    MOCK_DATA_INVALID: 'Local mock data could not be read. Restore the demo data to continue.',
    BROWSER_STORAGE_UNAVAILABLE: 'Browser storage is unavailable, so mock data cannot be saved.',
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

export function emptyMockData(): InterviewMockData {
  return { resumes: [], assessments: [], sessions: [], reviews: [] };
}

export type { InterviewDimensionKey };
