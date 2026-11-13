import type { PathTask } from './learning-path';

// Matches the backend: consecutive equal stage titles share the first task's UUID.
// Equal titles separated by another stage remain separate groups.
export function groupLearningTasks(tasks: PathTask[]) {
  const groups: { anchorTaskId: string; title: string; tasks: PathTask[] }[] = [];
  for (const task of tasks) {
    const previous = groups[groups.length - 1];
    if (previous && previous.title === task.stage) previous.tasks.push(task);
    else groups.push({ anchorTaskId: task.id, title: task.stage, tasks: [task] });
  }
  return groups;
}

export type StudyContinuation = { kind: 'task' | 'quiz'; id: string } | null;

// Finish the current stage before suggesting a later stage's learning task.
export function studyContinuation(tasks: PathTask[], taskId: string): StudyContinuation {
  const group = groupLearningTasks(tasks).find((item) => item.tasks.some((task) => task.id === taskId));
  if (!group || !group.tasks.find((task) => task.id === taskId)?.done) return null;
  const unfinished = group.tasks.find((task) => !task.done);
  return unfinished ? { kind: 'task', id: unfinished.id } : { kind: 'quiz', id: group.anchorTaskId };
}
