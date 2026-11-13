export type InterviewLocale = 'en' | 'zh';

export type ResumeLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'unspecified';

export type Resume = {
  id: string;
  title: string;
  text: string;
  sourceFilename: string | null;
  sourceMime: string | null;
  sourceSizeBytes: number | null;
  jobTitle: string;
  seniority: ResumeLevel;
  jobDescription: string;
  createdAt: string;
  updatedAt: string;
};

export type ResumeRecommendation = {
  section: string;
  sourceExcerpt: string | null;
  issue: string;
  rewriteExample: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
};

export type ResumeRisk = {
  category: string;
  evidence: string;
  suggestion: string;
};

export type ResumeAssessment = {
  id: string;
  resumeId: string;
  jobTitle: string;
  recommendations: ResumeRecommendation[];
  riskFlags: ResumeRisk[];
  createdAt: string;
};

export type QuestionCategory =
  | 'self_intro'
  | 'behavioral'
  | 'project_deep_dive'
  | 'technical'
  | 'pressure';

export type MasteryStatus = 'not_started' | 'in_progress' | 'mastered' | 'needs_review';

export type QuestionItem = {
  id: string;
  category: QuestionCategory;
  prompt: string;
  sourceExcerpt: string | null;
  assessmentFocus: string;
  answerFramework: string;
  sampleAnswer: string;
  pitfalls: string[];
  tags: string[];
  isFavorite: boolean;
  masteryStatus: MasteryStatus;
  followUps: string[];
};

export type QuestionSet = {
  id: string;
  title: string;
  resumeId: string | null;
  jobTitle: string;
  seniority: ResumeLevel;
  createdAt: string;
  items: QuestionItem[];
};

export type InterviewType = 'technical' | 'mixed';
export type InterviewStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned';
export type InterviewPhase =
  | 'introduction'
  | 'foundation'
  | 'deep_dive'
  | 'candidate_questions'
  | 'completed';

export type InterviewQuestion = {
  text: string;
  phase: InterviewPhase;
  index: number;
};

export type InterviewTurn = {
  id: string;
  role: 'assistant' | 'user';
  phase: InterviewPhase;
  text: string;
  createdAt: string;
  score?: number;
  strengths?: string[];
  improvements?: string[];
  superseded?: boolean;
};

export type InterviewDimensionKey =
  | 'communication'
  | 'technical_depth'
  | 'problem_solving'
  | 'job_fit';

export type InterviewReport = {
  overallScore: number;
  isPartial: boolean;
  dimensions: Record<InterviewDimensionKey, { score: number; summary: string }>;
  strengths: string[];
  improvements: string[];
  createdAt: string;
};

export type InterviewSession = {
  id: string;
  jobTitle: string;
  seniority: ResumeLevel;
  interviewType: InterviewType;
  questionLimit: number;
  askedCount: number;
  resumeId: string | null;
  status: InterviewStatus;
  phase: InterviewPhase;
  turns: InterviewTurn[];
  currentQuestion: InterviewQuestion | null;
  lastQuestion: InterviewQuestion | null;
  lastAnswerId: string | null;
  redoMode: boolean;
  returnQuestion: InterviewQuestion | null;
  candidateQuestionUsed: boolean;
  isPartial: boolean;
  report: InterviewReport | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewSource = 'mock_interview' | 'question_set' | 'manual';
export type ReviewStatus = 'not_reviewed' | 'in_progress' | 'mastered';

export type ReviewAttempt = {
  id: string;
  answer: string;
  score: number;
  feedback: string;
  createdAt: string;
};

export type ReviewItem = {
  id: string;
  source: ReviewSource;
  sourceId: string | null;
  question: string;
  category: QuestionCategory;
  tags: string[];
  answerFramework: string;
  lastAnswer: string;
  lastFeedback: string;
  masteryStatus: ReviewStatus;
  attempts: ReviewAttempt[];
  createdAt: string;
};

export type InterviewMockData = {
  resumes: Resume[];
  assessments: ResumeAssessment[];
  questionSets: QuestionSet[];
  sessions: InterviewSession[];
  reviews: ReviewItem[];
};
