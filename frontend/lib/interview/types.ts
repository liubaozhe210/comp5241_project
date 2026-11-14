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

export type ReviewCategory =
  | 'self_intro'
  | 'behavioral'
  | 'project_deep_dive'
  | 'technical'
  | 'pressure';

export type InterviewType = 'technical' | 'mixed';
export type InterviewStatus = 'in_progress' | 'completed' | 'abandoned';
export type InterviewPhase =
  | 'introduction'
  | 'foundation'
  | 'deep_dive'
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
  answerStatus?: 'answered' | 'skipped';
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
  overallScore: number | null;
  dimensions: Record<InterviewDimensionKey, { score: number | null; summary: string }>;
  strengths: string[];
  improvements: string[];
  unansweredCount: number;
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
  currentTurnId: string | null;
  latestFeedback?: string;
  questionDeadlineAt: string | null;
  reportErrorCode: string | null;
  report: InterviewReport | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewSource = 'mock_interview' | 'manual';
export type ReviewStatus = 'pending' | 'mastered';

export type ReviewItem = {
  id: string;
  source: ReviewSource;
  sourceId: string | null;
  question: string;
  category: ReviewCategory;
  tags: string[];
  answerFramework: string;
  lastAnswer: string;
  lastScore: number | null;
  lastFeedback: string;
  masterySuggested: boolean;
  lastPracticedAt: string | null;
  masteryStatus: ReviewStatus;
  createdAt: string;
};

export type InterviewMockData = {
  resumes: Resume[];
  assessments: ResumeAssessment[];
  sessions: InterviewSession[];
  reviews: ReviewItem[];
};
