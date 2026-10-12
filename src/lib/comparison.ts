import type { PublicTask } from "./domain";
export function comparableRuns(tasks: PublicTask[]) {
  const groups = new Map<string, PublicTask[]>();
  for (const task of tasks) {
    if (task.agent !== "openai" || !task.model || !task.comparisonKey || !task.attempts.at(-1)?.evaluation) continue;
    const group = groups.get(task.comparisonKey) || []; group.push(task); groups.set(task.comparisonKey, group);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
