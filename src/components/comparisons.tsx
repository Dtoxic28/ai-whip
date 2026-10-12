import type { PublicTask } from "@/lib/domain";
import { comparableRuns } from "@/lib/comparison";
import { Badge } from "./ui";
export function ComparableRuns({ tasks }: { tasks: PublicTask[] }) {
  const groups = comparableRuns(tasks);
  return <section className="comparable-runs"><span className="eyebrow">EQUIVALENT-TASK COMPARISONS</span><h3>Same assignment. Same proof requirements.</h3><p>Grouped only when the imported source, recorded runtime, full task, criteria, checks, repair mode, budgets match exactly. Scripted fixtures excluded. A few runs do not establish model superiority.</p>{!groups.length ? <p>No comparable real-provider runs recorded yet.</p> : groups.map(group => <div className="comparison-group" key={group[0].comparisonKey}><strong>{group[0].title}</strong>{group.map(task => <div className="comparison-row" key={task.id}><span>{task.model}</span><Badge status={task.attempts.at(-1)!.evaluation!.verdict}/><span>{task.attempts.length} attempts</span><span>{task.usage.inputTokens + task.usage.outputTokens} known tokens{task.usage.incomplete ? " (incomplete)" : ""}</span></div>)}</div>)}</section>;
}
