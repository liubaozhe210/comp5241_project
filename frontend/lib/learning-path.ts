export type PathTask = {
  id: string; stage: string; title: string; instructions: string;
  minutes: number; done: boolean; completed_at: string | null;
};
export type LearningPath = {
  id: string; current_version_id: string; version_id: string; version: number;
  topic: string; goal: string; level: string; budget_minutes: number;
  course_id: string | null; status: 'draft' | 'generating' | 'ready' | 'failed';
  created_at: string; completed_tasks: number; total_tasks: number;
  progress: number; next_task_id: string | null; tasks: PathTask[];
};
