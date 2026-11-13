export type PathTask = {
  id: string; stage: string; title: string; instructions: string;
  minutes: number; done: boolean; completed_at: string | null;
};
export type LearningPath = {
  id: string; current_version_id: string; version_id: string; version: number;
  topic: string; goal: string; level: string; budget_minutes: number;
  course_id: string | null; status: 'draft' | 'generating' | 'ready' | 'failed';
  generation_basis: 'not_generated' | 'materials' | 'goal_and_description' | 'unknown';
  estimated_minutes: number; extra_minutes: number;
  created_at: string; completed_tasks: number; total_tasks: number;
  progress: number; next_task_id: string | null; tasks: PathTask[];
  assessment_available: boolean; total_stages: number; passed_stages: number; completed_stages: number;
  plan_completed: boolean; completion_status: 'not_started' | 'in_progress' | 'awaiting_assessment' | 'completed' | 'assessment_unavailable';
  next_assessment_anchor: string | null;
};
