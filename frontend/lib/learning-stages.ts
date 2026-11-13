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
