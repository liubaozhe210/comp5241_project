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
  MasteryStatus,
  QuestionCategory,
  QuestionItem,
  QuestionSet,
  Resume,
  ResumeAssessment,
  ResumeLevel,
  ReviewItem,
  ReviewStatus,
} from './types';

type LegacyResumeAssessment = ResumeAssessment & {
  overallScore?: number;
  rating?: string;
  dimensions?: unknown;
};

const STORAGE_KEY = 'coursehub.interview.mock.v1';
const FAILURE_KEY = `${STORAGE_KEY}.fail-next-ai`;

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
    !Array.isArray((parsed as InterviewMockData).resumes) ||
    !Array.isArray((parsed as InterviewMockData).assessments) ||
    !Array.isArray((parsed as InterviewMockData).questionSets) ||
    !Array.isArray((parsed as InterviewMockData).sessions) ||
    !Array.isArray((parsed as InterviewMockData).reviews)
  ) {
    throw new Error('MOCK_DATA_INVALID');
  }
  const data = parsed as InterviewMockData;
  if (
    data.assessments.some(
      (assessment) =>
        'overallScore' in assessment || 'rating' in assessment || 'dimensions' in assessment,
    )
  ) {
    data.assessments = data.assessments.map((assessment) => {
      const {
        overallScore: _overallScore,
        rating: _rating,
        dimensions: _dimensions,
        ...report
      } = assessment as LegacyResumeAssessment;
      return report;
    });
    writeStorage(data);
  }
  return data;
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

function question(
  questionId: string,
  category: QuestionCategory,
  prompt: string,
  assessmentFocus: string,
  answerFramework: string,
  sampleAnswer: string,
  tags: string[],
  sourceExcerpt: string | null = null,
): QuestionItem {
  return {
    id: questionId,
    category,
    prompt,
    sourceExcerpt,
    assessmentFocus,
    answerFramework,
    sampleAnswer,
    pitfalls: [
      'State your individual contribution clearly.',
      'Support claims with a concrete example rather than a broad statement.',
    ],
    tags,
    isFavorite: false,
    masteryStatus: 'not_started',
    followUps: [],
  };
}

function makeQuestionSet(): QuestionSet {
  return {
    id: 'questions-demo',
    title: 'Frontend Engineer — practice set',
    resumeId: 'resume-demo',
    jobTitle: 'Frontend Engineer',
    seniority: 'junior',
    createdAt: now(),
    items: [
      question(
        'q-demo-intro',
        'self_intro',
        'Give me a one-minute introduction focused on your frontend experience.',
        'Clarity, relevance, and a concise career narrative.',
        'Present → relevant experience → one project result → role motivation.',
        'I am a computer science graduate focused on frontend engineering. In my campus events project, I built reusable React and TypeScript components and improved keyboard navigation. I enjoy turning user needs into clear, accessible interfaces, and I am looking for a role where I can continue growing those skills.',
        ['introduction', 'communication'],
        'Built a responsive event dashboard using React and TypeScript.',
      ),
      question(
        'q-demo-behavioral',
        'behavioral',
        'Tell me about a time you improved an experience for users with different accessibility needs.',
        'Whether you identify a specific barrier, explain your action, and describe the result.',
        'STAR: situation and task → action you personally took → result and learning.',
        'Use the keyboard-navigation work from your project. Explain the original barrier, how you tested the interaction, what you changed, and what you would measure next.',
        ['STAR', 'accessibility'],
        'Added keyboard navigation to event pages.',
      ),
      question(
        'q-demo-project',
        'project_deep_dive',
        'How did you decide which parts of the event dashboard should become reusable components?',
        'Component boundaries, trade-offs, and maintainability.',
        'Describe repeated patterns → compare alternatives → explain the boundary → mention a trade-off.',
        'Refer to repeated event-page UI from your project. Explain how you chose a shared component and how documented props helped teammates use it consistently.',
        ['React', 'architecture'],
        'Worked with three teammates and built reusable components.',
      ),
      question(
        'q-demo-technical',
        'technical',
        'How would you keep a search and filter interface responsive as the event list grows?',
        'Reasoning about rendering, data volume, and user-perceived performance.',
        'Clarify the scale → measure → choose client/server filtering or pagination → verify with profiling.',
        'Start by asking about list size and data source. Avoid claiming an optimization you have not measured; explain the trade-offs and what metric you would check.',
        ['performance', 'React'],
      ),
      question(
        'q-demo-pressure',
        'pressure',
        'Your resume says you improved consistency, but gives no measurements. How do you know the change helped?',
        'Honest handling of evidence and ability to define useful measures.',
        'Acknowledge what was and was not measured → cite available evidence → propose a follow-up metric.',
        'Do not invent a percentage. Explain the observed reduction in repeated UI code, then describe how you would measure defects or implementation time in a future iteration.',
        ['evidence', 'reflection'],
        'Reduced repeated UI code and improved consistency.',
      ),
    ],
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
    lastQuestion: null,
    lastAnswerId: null,
    redoMode: false,
    returnQuestion: null,
    candidateQuestionUsed: false,
    isPartial: false,
    report: {
      overallScore: 79,
      isPartial: true,
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
    lastFeedback: 'Give a concrete example of what changed, and avoid claiming impact you did not measure.',
    masteryStatus: 'not_reviewed',
    attempts: [],
    createdAt: now(),
  };
}

function createDemoData(): InterviewMockData {
  const resume = makeResume();
  const set = makeQuestionSet();
  const session = makeSession();
  return {
    resumes: [resume],
    assessments: [makeAssessment(resume.id)],
    questionSets: [set],
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

function generatedQuestions(locale: InterviewLocale, experience: string): QuestionItem[] {
  const excerpt = experience.trim().slice(0, 180) || null;
  if (locale === 'zh') {
    return [
      question(
        id('question'),
        'self_intro',
        '请用 1 分钟介绍自己，并突出与目标岗位最相关的经历。',
        '表达是否简洁、重点是否与岗位相关。',
        '当前定位 → 相关经历 → 一个项目成果 → 求职动机。',
        '请只使用真实经历，按“背景—行动—结果”组织内容；没有的数据不要编造。',
        ['自我介绍', '表达'],
        excerpt,
      ),
      question(
        id('question'),
        'self_intro',
        '请用 3 分钟介绍你的经历、代表项目和未来发展方向。',
        '是否能把教育、项目和岗位动机串联成清晰叙事。',
        '个人定位 → 关键项目 → 个人贡献 → 复盘与目标。',
        '围绕一至两个真实项目展开，说明你的职责、选择和学到的经验。',
        ['自我介绍', '职业规划'],
        excerpt,
      ),
      question(
        id('question'),
        'behavioral',
        '讲一次你遇到困难并推动问题解决的经历。',
        '行动是否具体，是否能清楚区分个人贡献与团队成果。',
        'STAR：背景与任务 → 个人行动 → 结果 → 复盘。',
        '先说明问题，再讲自己采取的步骤；结果只陈述可以验证的事实。',
        ['STAR', '解决问题'],
        excerpt,
      ),
      question(
        id('question'),
        'behavioral',
        '讲一次你收到反馈后调整做法的经历。',
        '是否能接受反馈、采取行动并总结变化。',
        '反馈背景 → 你的理解 → 调整行动 → 后续结果。',
        '选择真实反馈，说明你具体改了什么，以及后来如何验证改进。',
        ['STAR', '协作'],
        excerpt,
      ),
      question(
        id('question'),
        'behavioral',
        '当团队成员对实现方案有分歧时，你会如何处理？请结合经历。',
        '沟通、证据使用与协作决策能力。',
        '说明分歧 → 明确共同目标 → 比较证据/取舍 → 决定与复盘。',
        '避免把分歧描述成个人冲突，重点说明如何形成可执行决定。',
        ['协作', '沟通'],
        excerpt,
      ),
      question(
        id('question'),
        'project_deep_dive',
        '在这个项目中，你个人负责的部分是什么？',
        '能否准确说明个人责任边界。',
        '项目目标 → 个人职责 → 关键决策 → 结果/限制。',
        '明确区分个人工作和团队成果，不夸大职责。',
        ['项目深挖', '职责'],
        excerpt,
      ),
      question(
        id('question'),
        'project_deep_dive',
        '项目中最困难的技术问题是什么？你如何定位并解决？',
        '问题拆解、技术判断和验证过程。',
        '问题表现 → 假设 → 排查步骤 → 方案取舍 → 验证。',
        '描述可复现的问题与验证方法，不要只说“优化了性能”。',
        ['项目深挖', '技术判断'],
        excerpt,
      ),
      question(
        id('question'),
        'project_deep_dive',
        '如果重新做一次这个项目，你会优先改进什么？',
        '反思能力和对技术债/用户价值的判断。',
        '当前限制 → 改进优先级 → 预期收益 → 验证方式。',
        '选择一个具体改进点并解释原因，避免泛泛而谈“优化代码”。',
        ['项目深挖', '复盘'],
        excerpt,
      ),
      question(
        id('question'),
        'technical',
        '你会如何测试一个你刚实现的功能？',
        '测试层次、边界条件和验证思路。',
        '列出正常路径 → 边界/错误路径 → 合适的测试层 → 验证结果。',
        '结合简历中实际使用的工具；没有使用过的工具不要声称有经验。',
        ['测试', '技术'],
        excerpt,
      ),
      question(
        id('question'),
        'technical',
        '如何在保证可维护性的同时改善一个页面的响应速度？',
        '是否先测量再优化，以及对方案取舍的理解。',
        '定义指标 → 找瓶颈 → 选择最小改动 → 对比验证。',
        '说明如何避免过早优化，并指出需要观察的用户体验指标。',
        ['性能', '技术'],
        excerpt,
      ),
      question(
        id('question'),
        'technical',
        '讲讲你熟悉的一项技术，以及它不适用的场景。',
        '技术理解深度和对边界的认识。',
        '适用问题 → 工作方式 → 优势 → 限制/替代方案。',
        '只选择真实掌握的技术；给出具体场景而不是背定义。',
        ['技术基础'],
        excerpt,
      ),
      question(
        id('question'),
        'pressure',
        '你提到项目有明显改进，但没有数字。你如何证明它确实有帮助？',
        '面对质疑时是否诚实，并能提出可验证证据。',
        '承认未测量之处 → 说明已有证据 → 提出下一步指标。',
        '不要编造百分比；可以说明现有观察和今后如何测量。',
        ['压力面试', '证据'],
        excerpt,
      ),
      question(
        id('question'),
        'pressure',
        '如果你的方案上线后没有达到预期，你会怎么做？',
        '责任意识、排查思路和迭代能力。',
        '确认影响 → 收集数据 → 定位原因 → 沟通和回滚/改进。',
        '优先考虑用户影响与可逆性，再说明复盘计划。',
        ['压力面试', '应变'],
        excerpt,
      ),
    ];
  }
  return [
    question(
      id('question'),
      'self_intro',
      'Give me a one-minute introduction focused on your most relevant experience.',
      'Conciseness, role relevance, and a clear narrative.',
      'Present → relevant experience → one project result → motivation.',
      'Use only verifiable experience and organize it around context, action, and outcome.',
      ['introduction', 'communication'],
      excerpt,
    ),
    question(
      id('question'),
      'self_intro',
      'Give me a three-minute overview of your experience and career direction.',
      'How well you connect education, projects, and role motivation.',
      'Positioning → key project → individual contribution → learning and goals.',
      'Choose one or two real projects and explain your role, decisions, and learning.',
      ['introduction', 'career'],
      excerpt,
    ),
    question(
      id('question'),
      'behavioral',
      'Tell me about a time you faced a difficult problem and helped resolve it.',
      'Specific actions and distinction between individual and team impact.',
      'STAR: situation/task → personal action → result → reflection.',
      'Describe the problem and your steps; state only outcomes you can verify.',
      ['STAR', 'problem solving'],
      excerpt,
    ),
    question(
      id('question'),
      'behavioral',
      'Tell me about a time you changed your approach after receiving feedback.',
      'Openness to feedback and follow-through.',
      'Feedback context → interpretation → action → result.',
      'Use a real example and explain how you checked whether the change helped.',
      ['STAR', 'collaboration'],
      excerpt,
    ),
    question(
      id('question'),
      'behavioral',
      'How do you handle a disagreement about an implementation approach?',
      'Communication, evidence, and collaborative decision-making.',
      'State the difference → align on goals → compare evidence/trade-offs → decide and reflect.',
      'Focus on reaching an actionable decision rather than assigning blame.',
      ['collaboration', 'communication'],
      excerpt,
    ),
    question(
      id('question'),
      'project_deep_dive',
      'What parts of this project were specifically your responsibility?',
      'Clear ownership boundaries.',
      'Project goal → your role → key decision → result or limitation.',
      'Separate your own work from the team outcome and avoid overstating ownership.',
      ['project', 'ownership'],
      excerpt,
    ),
    question(
      id('question'),
      'project_deep_dive',
      'What was the most difficult technical issue, and how did you investigate it?',
      'Problem decomposition, technical judgment, and verification.',
      'Symptom → hypothesis → investigation → trade-off → validation.',
      'Describe a reproducible issue and how you verified the fix.',
      ['project', 'technical judgment'],
      excerpt,
    ),
    question(
      id('question'),
      'project_deep_dive',
      'If you rebuilt this project, what would you improve first?',
      'Reflection and prioritization.',
      'Current limitation → priority → expected benefit → validation.',
      'Choose one concrete improvement and explain why it matters.',
      ['project', 'reflection'],
      excerpt,
    ),
    question(
      id('question'),
      'technical',
      'How would you test a feature you have just implemented?',
      'Test levels, edge cases, and verification.',
      'Happy path → edge/error cases → suitable test level → verify results.',
      'Use tools you have actually used; do not claim experience you do not have.',
      ['testing', 'technical'],
      excerpt,
    ),
    question(
      id('question'),
      'technical',
      'How would you improve page responsiveness without harming maintainability?',
      'Measure-first thinking and trade-off awareness.',
      'Define a metric → locate bottleneck → smallest change → compare results.',
      'Explain how you avoid premature optimization and which user metric matters.',
      ['performance', 'technical'],
      excerpt,
    ),
    question(
      id('question'),
      'technical',
      'Explain a technology you know well and a situation where it is not a good fit.',
      'Depth and awareness of boundaries.',
      'Use case → how it works → strengths → limitations/alternatives.',
      'Choose a technology you really know and use a concrete scenario.',
      ['technical fundamentals'],
      excerpt,
    ),
    question(
      id('question'),
      'pressure',
      'You claim this project improved the workflow, but provide no numbers. How can you support that claim?',
      'Honesty under challenge and ability to propose evidence.',
      'Acknowledge what was not measured → state available evidence → propose a metric.',
      'Do not invent a percentage; distinguish observation from measurement.',
      ['pressure', 'evidence'],
      excerpt,
    ),
    question(
      id('question'),
      'pressure',
      'What would you do if your solution did not meet expectations after release?',
      'Ownership, investigation, and iteration.',
      'Assess impact → gather evidence → find cause → communicate and mitigate.',
      'Prioritize user impact and reversibility, then describe the follow-up.',
      ['pressure', 'adaptability'],
      excerpt,
    ),
  ];
}

export async function generateQuestionSet(input: {
  resumeId: string | null;
  experience: string;
  jobTitle: string;
  seniority: ResumeLevel;
  locale: InterviewLocale;
}): Promise<QuestionSet> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const resume = input.resumeId ? data.resumes.find((item) => item.id === input.resumeId) : undefined;
  if (input.resumeId && !resume) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  const experience = input.experience.trim() || resume?.text || '';
  if (experience.length < 30) throw new Error('INTERVIEW_TEXT_TOO_SHORT');
  const set: QuestionSet = {
    id: id('questions'),
    title: `${input.jobTitle || resume?.jobTitle || (input.locale === 'zh' ? '目标岗位' : 'Target role')} — ${input.locale === 'zh' ? '模拟题集' : 'practice set'}`,
    resumeId: input.resumeId,
    jobTitle: input.jobTitle.trim() || resume?.jobTitle || '',
    seniority: input.seniority,
    createdAt: now(),
    items: generatedQuestions(input.locale, experience),
  };
  data.questionSets.unshift(set);
  writeStorage(data);
  return set;
}

export async function addFollowUps(
  setId: string,
  itemId: string,
  locale: InterviewLocale,
): Promise<string[]> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const item = data.questionSets.find((set) => set.id === setId)?.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  const followUps =
    locale === 'zh'
      ? ['你如何验证这个方案有效？', '当时还考虑过哪些替代方案？']
      : ['How did you verify that the approach worked?', 'What alternatives did you consider?'];
  item.followUps.push(...followUps);
  writeStorage(data);
  return followUps;
}

export async function generateAnotherQuestion(
  setId: string,
  itemId: string,
  locale: InterviewLocale,
): Promise<QuestionItem> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const set = data.questionSets.find((entry) => entry.id === setId);
  const source = set?.items.find((entry) => entry.id === itemId);
  if (!set || !source) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  const item: QuestionItem = {
    ...source,
    id: id('question'),
    prompt:
      locale === 'zh'
        ? `换一个角度：${source.prompt.replace(/[？?]$/, '')}时，你会如何说明取舍和验证方式？`
        : `From another angle: how would you explain the trade-offs and validation for this example?`,
    isFavorite: false,
    masteryStatus: 'not_started',
    followUps: [],
  };
  set.items.push(item);
  writeStorage(data);
  return item;
}

function findOrCreateReview(
  data: InterviewMockData,
  input: Omit<ReviewItem, 'id' | 'attempts' | 'createdAt' | 'masteryStatus'>,
) {
  const existing = data.reviews.find((item) => item.source === input.source && item.sourceId === input.sourceId);
  if (existing) {
    Object.assign(existing, input);
    existing.masteryStatus = 'not_reviewed';
    return existing;
  }
  const review: ReviewItem = {
    ...input,
    id: id('review'),
    attempts: [],
    masteryStatus: 'not_reviewed',
    createdAt: now(),
  };
  data.reviews.unshift(review);
  return review;
}

export async function updateQuestionItem(
  setId: string,
  itemId: string,
  patch: { isFavorite?: boolean; masteryStatus?: MasteryStatus },
  locale: InterviewLocale,
): Promise<void> {
  await mutate((data) => {
    const set = data.questionSets.find((entry) => entry.id === setId);
    const item = set?.items.find((entry) => entry.id === itemId);
    if (!set || !item) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
    Object.assign(item, patch);
    const shouldReview = item.isFavorite || item.masteryStatus === 'needs_review';
    const review = data.reviews.find((entry) => entry.source === 'question_set' && entry.sourceId === item.id);
    if (shouldReview) {
      findOrCreateReview(data, {
        source: 'question_set',
        sourceId: item.id,
        question: item.prompt,
        category: item.category,
        tags: item.tags,
        answerFramework: item.answerFramework,
        lastAnswer: '',
        lastFeedback:
          locale === 'zh'
            ? '这是你标记的重点题，完成练习后再更新掌握状态。'
            : 'You marked this as a focus question. Update mastery after practicing.',
      });
    } else if (item.masteryStatus === 'mastered' && review) {
      review.masteryStatus = 'mastered';
    } else if (review && !item.isFavorite && item.masteryStatus !== 'needs_review') {
      data.reviews = data.reviews.filter((entry) => entry.id !== review.id);
    }
  });
}

export async function deleteQuestionSet(setId: string): Promise<void> {
  await mutate((data) => {
    const set = data.questionSets.find((item) => item.id === setId);
    if (!set) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
    const questionIds = new Set(set.items.map((item) => item.id));
    data.questionSets = data.questionSets.filter((item) => item.id !== setId);
    data.reviews = data.reviews.filter((item) => !(item.source === 'question_set' && item.sourceId && questionIds.has(item.sourceId)));
  });
}

export async function createInterview(input: {
  jobTitle: string;
  seniority: ResumeLevel;
  interviewType: InterviewType;
  questionLimit: number;
  resumeId: string | null;
  locale: InterviewLocale;
}): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  if (input.resumeId && !data.resumes.some((resume) => resume.id === input.resumeId)) {
    throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  }
  const introText =
    input.locale === 'zh'
      ? `欢迎参加${input.jobTitle}岗位模拟面试。我会逐题提问，你可以随时暂停或结束。请先做自我介绍，并说明最相关的经历。`
      : `Welcome to your ${input.jobTitle} mock interview. I will ask one question at a time; you can pause or end whenever you like. Please introduce yourself and highlight your most relevant experience.`;
  const createdAt = now();
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
        id: id('turn'),
        role: 'assistant',
        phase: 'introduction',
        text: introText,
        createdAt,
      },
    ],
    currentQuestion: firstQuestion,
    lastQuestion: null,
    lastAnswerId: null,
    redoMode: false,
    returnQuestion: null,
    candidateQuestionUsed: false,
    isPartial: false,
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
  answeredPhase: InterviewPhase,
  locale: InterviewLocale,
): InterviewQuestion {
  const index = session.askedCount + 1;
  const phase: InterviewPhase = answeredPhase === 'introduction' ? 'foundation' : 'deep_dive';
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
      existing.lastFeedback = feedback;
      existing.masteryStatus = score >= 80 ? 'mastered' : 'in_progress';
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
    lastFeedback: feedback,
  });
}

export async function sendInterviewAnswer(
  sessionId: string,
  answer: string,
  locale: InterviewLocale,
): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || session.status !== 'in_progress' || !session.currentQuestion) {
    throw new Error('INTERVIEW_SESSION_STATE_INVALID');
  }
  const question = session.currentQuestion;
  const cleanAnswer = answer.trim();
  if (!cleanAnswer || cleanAnswer.length > 8_000) throw new Error('INTERVIEW_ANSWER_INVALID');
  const createdAt = now();
  const userTurnId = id('turn');

  if (question.phase === 'candidate_questions') {
    session.turns.push(
      { id: userTurnId, role: 'user', phase: question.phase, text: cleanAnswer, createdAt },
      {
        id: id('turn'),
        role: 'assistant',
        phase: question.phase,
        text:
          locale === 'zh'
            ? '这是一个很好的反问。可以结合团队目标和日常协作继续了解。准备好后点击“结束并复盘”。'
            : 'That is a thoughtful question. You can explore the team goals and day-to-day collaboration further. Select “Finish and review” when ready.',
        createdAt: now(),
      },
    );
    session.candidateQuestionUsed = true;
    session.currentQuestion = null;
    session.updatedAt = now();
    writeStorage(data);
    return session;
  }

  const score = Math.max(42, Math.min(96, 48 + (cleanAnswer.length % 49)));
  const feedback =
    locale === 'zh'
      ? score < 60
        ? '你已经给出了方向；再补充一个具体行动和可验证的结果会更有说服力。'
        : '回答重点清楚；可以再用一个具体例子说明你的个人贡献。'
      : score < 60
        ? 'You have a useful starting point; add one specific action and a verifiable outcome.'
        : 'Your main point is clear; one concrete example would make your contribution stronger.';
  const userTurn: InterviewTurn = {
    id: userTurnId,
    role: 'user',
    phase: question.phase,
    text: cleanAnswer,
    createdAt,
    score,
    strengths: [locale === 'zh' ? '回答切题，表达了相关思路。' : 'The response addresses the prompt with a relevant approach.'],
    improvements: [locale === 'zh' ? '补充个人行动和结果证据。' : 'Add your specific action and evidence of the outcome.'],
  };

  if (session.redoMode && session.lastAnswerId) {
    session.turns = session.turns.map((turn) =>
      turn.id === session.lastAnswerId ? { ...turn, superseded: true } : turn,
    );
    session.turns.push(userTurn, {
      id: id('turn'),
      role: 'assistant',
      phase: question.phase,
      text: `${feedback}\n\n${session.returnQuestion?.text ?? ''}`.trim(),
      createdAt: now(),
    });
    makeReviewFromAnswer(data, session, question, cleanAnswer, feedback, score);
    session.lastAnswerId = userTurnId;
    session.currentQuestion = session.returnQuestion;
    if (session.currentQuestion) session.phase = session.currentQuestion.phase;
    session.returnQuestion = null;
    session.redoMode = false;
    session.updatedAt = now();
    writeStorage(data);
    return session;
  }

  session.turns.push(userTurn);
  makeReviewFromAnswer(data, session, question, cleanAnswer, feedback, score);
  session.lastQuestion = question;
  session.lastAnswerId = userTurnId;

  if (question.phase === 'deep_dive' && session.askedCount >= session.questionLimit) {
    const candidatePrompt =
      locale === 'zh'
        ? '现在进入反问环节。你可以向面试官提一个问题，也可以跳过并直接结束面试。'
        : 'Now it is your turn to ask a question. Ask the interviewer one question, or skip and finish the interview.';
    session.phase = 'candidate_questions';
    session.currentQuestion = { text: candidatePrompt, phase: 'candidate_questions', index: session.askedCount + 1 };
    session.turns.push({
      id: id('turn'),
      role: 'assistant',
      phase: 'candidate_questions',
      text: `${feedback}\n\n${candidatePrompt}`,
      createdAt: now(),
    });
  } else {
    session.currentQuestion = nextQuestion(session, question.phase, locale);
    session.askedCount = session.currentQuestion.index;
    session.phase = session.currentQuestion.phase;
    session.turns.push({
      id: id('turn'),
      role: 'assistant',
      phase: session.currentQuestion.phase,
      text: `${feedback}\n\n${session.currentQuestion.text}`,
      createdAt: now(),
    });
  }
  session.updatedAt = now();
  writeStorage(data);
  return session;
}

export async function pauseInterview(sessionId: string): Promise<void> {
  await mutate((data) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'in_progress') throw new Error('INTERVIEW_SESSION_STATE_INVALID');
    session.status = 'paused';
    session.updatedAt = now();
  });
}

export async function resumeInterview(sessionId: string): Promise<void> {
  await mutate((data) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'paused') throw new Error('INTERVIEW_SESSION_STATE_INVALID');
    session.status = 'in_progress';
    session.updatedAt = now();
  });
}

export async function redoLastAnswer(sessionId: string, locale: InterviewLocale): Promise<void> {
  await mutate((data) => {
    const session = data.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'in_progress' || !session.lastQuestion || !session.lastAnswerId) {
      throw new Error('INTERVIEW_SESSION_STATE_INVALID');
    }
    session.returnQuestion = session.currentQuestion;
    session.currentQuestion = session.lastQuestion;
    session.phase = session.lastQuestion.phase;
    session.redoMode = true;
    session.turns.push({
      id: id('turn'),
      role: 'assistant',
      phase: session.lastQuestion.phase,
      text:
        locale === 'zh'
          ? '请重新回答上一题；提交后会回到当前的下一题。'
          : 'Please answer the previous question again. After submission, you will return to the pending question.',
      createdAt: now(),
    });
    session.updatedAt = now();
  });
}

function makeReport(session: InterviewSession, isPartial: boolean): InterviewReport {
  const answers = session.turns.filter(
    (turn) => turn.role === 'user' && turn.phase !== 'candidate_questions' && !turn.superseded,
  );
  const average = answers.length
    ? Math.round(answers.reduce((sum, turn) => sum + (turn.score ?? 65), 0) / answers.length)
    : 0;
  const communication = Math.max(0, Math.min(100, average - 2));
  const technical = Math.max(0, Math.min(100, average + 2));
  const summary =
    answers.length === 0
      ? 'No scored answers were available for this session.'
      : 'This is a mock review based on your saved answers. Add concrete examples and explain how you verified outcomes.';
  const dimension = (score: number) => ({ score, summary });
  return {
    overallScore: average,
    isPartial,
    dimensions: {
      communication: dimension(communication),
      technical_depth: dimension(technical),
      problem_solving: dimension(average),
      job_fit: dimension(average),
    },
    strengths: answers.length
      ? ['You completed the practice flow.', 'Your answers are available for review.']
      : ['You completed the session configuration.'],
    improvements: answers.length
      ? ['Add a specific example and your individual action.', 'Support outcomes with verifiable evidence.']
      : ['Answer at least one question to receive a meaningful practice review.'],
    createdAt: now(),
  };
}

export async function finishInterview(
  sessionId: string,
  locale: InterviewLocale,
): Promise<InterviewSession> {
  requireBrowser();
  await delay();
  try {
    consumeAiFailure();
  } catch (error) {
    const data = readStorage();
    const failedSession = data.sessions.find((item) => item.id === sessionId);
    if (failedSession) {
      failedSession.status = 'abandoned';
      failedSession.updatedAt = now();
      writeStorage(data);
    }
    throw error;
  }
  const data = readStorage();
  const session = data.sessions.find((item) => item.id === sessionId);
  if (!session || !['in_progress', 'paused', 'abandoned'].includes(session.status)) {
    throw new Error('INTERVIEW_SESSION_STATE_INVALID');
  }
  const isPartial = session.askedCount < session.questionLimit || session.phase !== 'candidate_questions';
  session.report = makeReport(session, isPartial);
  session.status = 'completed';
  session.phase = 'completed';
  session.isPartial = isPartial;
  session.currentQuestion = null;
  session.updatedAt = now();
  if (locale === 'zh' && session.report) {
    session.report.strengths = ['你完成了本次练习流程。', '回答记录已保存，可逐题复盘。'];
    session.report.improvements = ['补充具体案例和个人行动。', '用可核验的证据支持结果。'];
  }
  writeStorage(data);
  return session;
}

export async function deleteResume(resumeId: string): Promise<void> {
  await mutate((data) => {
    if (!data.resumes.some((item) => item.id === resumeId)) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
    const deletedSetIds = new Set(data.questionSets.filter((set) => set.resumeId === resumeId).map((set) => set.id));
    const deletedQuestionIds = new Set(
      data.questionSets.filter((set) => deletedSetIds.has(set.id)).flatMap((set) => set.items.map((item) => item.id)),
    );
    const deletedSessionIds = new Set(data.sessions.filter((session) => session.resumeId === resumeId).map((session) => session.id));
    data.resumes = data.resumes.filter((item) => item.id !== resumeId);
    data.assessments = data.assessments.filter((item) => item.resumeId !== resumeId);
    data.questionSets = data.questionSets.filter((item) => item.resumeId !== resumeId);
    data.sessions = data.sessions.filter((item) => item.resumeId !== resumeId);
    data.reviews = data.reviews.filter(
      (item) =>
        !(item.source === 'question_set' && item.sourceId && deletedQuestionIds.has(item.sourceId)) &&
        !(item.source === 'mock_interview' && item.sourceId && [...deletedSessionIds].some((sessionId) => item.sourceId?.startsWith(`${sessionId}:`))),
    );
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
  category: QuestionCategory;
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
      lastFeedback: '',
      masteryStatus: 'not_reviewed',
      attempts: [],
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
  item.attempts.push({ id: id('attempt'), answer: answer.trim(), score, feedback, createdAt: now() });
  item.lastAnswer = answer.trim();
  item.lastFeedback = feedback;
  item.masteryStatus = score >= 80 ? 'in_progress' : 'not_reviewed';
  writeStorage(data);
  return item;
}

export async function generateReviewVariants(
  reviewId: string,
  locale: InterviewLocale,
): Promise<ReviewItem[]> {
  requireBrowser();
  await delay();
  consumeAiFailure();
  const data = readStorage();
  const source = data.reviews.find((item) => item.id === reviewId);
  if (!source) throw new Error('INTERVIEW_RESOURCE_NOT_FOUND');
  const stems =
    locale === 'zh'
      ? ['如果团队成员不同意你的分析，你会如何验证并推进？', '你会用什么证据判断这个改进值得继续？']
      : ['How would you validate your analysis if a teammate disagreed?', 'What evidence would tell you this improvement is worth continuing?'];
  const variants = stems.map((prompt) => ({
    id: id('review'),
    source: 'manual' as const,
    sourceId: source.id,
    question: prompt,
    category: source.category,
    tags: [...source.tags, locale === 'zh' ? '变式题' : 'variant'],
    answerFramework: source.answerFramework,
    lastAnswer: '',
    lastFeedback: '',
    masteryStatus: 'not_reviewed' as const,
    attempts: [],
    createdAt: now(),
  }));
  data.reviews.unshift(...variants);
  writeStorage(data);
  return variants;
}

export async function clearInterviewData(): Promise<void> {
  await mutate((data) => {
    data.resumes = [];
    data.assessments = [];
    data.questionSets = [];
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

export function isAiFailure(error: unknown) {
  return error instanceof Error && error.message === 'INTERVIEW_AI_UNAVAILABLE';
}

export function formatMockError(error: unknown, locale: InterviewLocale) {
  const code = error instanceof Error ? error.message : 'UNKNOWN';
  const zh: Record<string, string> = {
    INTERVIEW_AI_UNAVAILABLE: '模拟 AI 暂时不可用。输入已保留，请稍后重试。',
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

export function labelForCategory(category: QuestionCategory, locale: InterviewLocale) {
  const zh: Record<QuestionCategory, string> = {
    self_intro: '自我介绍',
    behavioral: '行为面试',
    project_deep_dive: '项目深挖',
    technical: '技术问题',
    pressure: '压力面试',
  };
  const en: Record<QuestionCategory, string> = {
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

export function masteryStatusLabel(status: MasteryStatus | ReviewStatus, locale: InterviewLocale) {
  const zh: Record<MasteryStatus | ReviewStatus, string> = {
    not_started: '未开始',
    in_progress: '复习中',
    mastered: '已掌握',
    needs_review: '需复习',
    not_reviewed: '未复习',
  };
  const en: Record<MasteryStatus | ReviewStatus, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    mastered: 'Mastered',
    needs_review: 'Needs review',
    not_reviewed: 'Not reviewed',
  };
  return (locale === 'zh' ? zh : en)[status];
}

export function interviewPhaseLabel(phase: InterviewPhase, locale: InterviewLocale) {
  const zh: Record<InterviewPhase, string> = {
    introduction: '自我介绍',
    foundation: '基础考察',
    deep_dive: '经历深挖',
    candidate_questions: '候选人反问',
    completed: '已完成',
  };
  const en: Record<InterviewPhase, string> = {
    introduction: 'Introduction',
    foundation: 'Fundamentals',
    deep_dive: 'Deep dive',
    candidate_questions: 'Your questions',
    completed: 'Completed',
  };
  return (locale === 'zh' ? zh : en)[phase];
}

export function interviewStatusLabel(status: InterviewSession['status'], locale: InterviewLocale) {
  const zh: Record<InterviewSession['status'], string> = {
    in_progress: '进行中',
    paused: '已暂停',
    completed: '已完成',
    abandoned: '待生成复盘',
  };
  const en: Record<InterviewSession['status'], string> = {
    in_progress: 'In progress',
    paused: 'Paused',
    completed: 'Completed',
    abandoned: 'Review pending',
  };
  return (locale === 'zh' ? zh : en)[status];
}

export function questionCategoryKeys(): QuestionCategory[] {
  return ['self_intro', 'behavioral', 'project_deep_dive', 'technical', 'pressure'];
}

export function emptyMockData(): InterviewMockData {
  return { resumes: [], assessments: [], questionSets: [], sessions: [], reviews: [] };
}

export type { InterviewDimensionKey };
