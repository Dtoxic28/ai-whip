import { createHash, randomUUID } from "node:crypto";
import { taskInputSchema, activeStates, terminalStates, type Task, type TaskInput, type Status } from "./domain";
import { createWorkspace, snapshot, revision, changes } from "./workspace";
import { transact, getStore, mutateTask, addEvent } from "./store";
import { adapters, BudgetError, configuredRates } from "./agents";
import { evaluate } from "./detector";
import { runCheck, inspectCheck } from "./executor";
import { roast, performanceReview } from "./humor";

const globals = globalThis as typeof globalThis & { whipControllers?: Map<string, AbortController> };
const controllers = globals.whipControllers ||= new Map<string, AbortController>();
const transitions: Record<Status, Status[]> = {
  queued: ["planning", "cancelled", "blocked", "budget_exceeded"], planning: ["executing", "cancelled", "blocked", "budget_exceeded"], executing: ["awaiting_check_approval", "validating", "cancelled", "blocked", "budget_exceeded"], awaiting_check_approval: ["validating", "cancelled", "blocked", "budget_exceeded"], validating: ["reviewing", "cancelled", "blocked", "budget_exceeded"], reviewing: ["completed", "diagnosing", "cancelled", "blocked", "budget_exceeded"], diagnosing: ["awaiting_repair_approval", "repairing", "failed", "cancelled", "blocked", "budget_exceeded"], awaiting_repair_approval: ["awaiting_check_approval", "repairing", "cancelled", "failed", "blocked", "budget_exceeded"], repairing: ["awaiting_check_approval", "validating", "cancelled", "blocked", "budget_exceeded"], completed: [], failed: [], cancelled: [], blocked: [], budget_exceeded: []
};
export function transition(task: Task, status: Status) {
  if (task.status === status) return;
  if (!transitions[task.status].includes(status)) throw new Error(`Invalid transition: ${task.status} to ${status}.`);
  task.status = status; addEvent(task, "state", `State: ${status.replaceAll("_", " ")}.`);
}
const commandsHash = (task: Task) => createHash("sha256").update(JSON.stringify(task.checks)).digest("hex");
export async function createTask(raw: unknown) {
  const input = taskInputSchema.parse(raw);
  if (input.agent === "openai" && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)) throw new Error("OpenAI employee is unconfigured. Set OPENAI_API_KEY and OPENAI_MODEL server-side.");
  if (input.budgets.maxCostUsd !== null && input.agent === "openai" && !configuredRates()) throw new Error("A cost cap needs both configured per-million-token rates. Cost is otherwise unavailable.");
  const id = randomUUID(), workspace = await createWorkspace(id, input);
  const task: Task = { ...input, ...workspace, id, model: input.agent === "openai" ? process.env.OPENAI_MODEL! : null, comparisonKey: createHash("sha256").update(JSON.stringify({ title: input.title, description: input.description, baseline: revision(workspace.baseline), criteria: input.criteria, checks: input.checks, budgets: input.budgets, repairMode: input.repairMode, runtime: { node: process.version, platform: process.platform, arch: process.arch } })).digest("hex"), createdAt: new Date().toISOString(), status: "queued", attempts: [], events: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: input.agent === "fixture" || configuredRates() ? 0 : null }, manualApprovals: [], reviewedFindings: [], lastRoast: 0 };
  addEvent(task, "state", input.agent === "fixture" ? "Queued: SCRIPTED FIXTURE. Real test processes; simulated employee and claims." : "Queued: real OpenAI Responses tool-calling employee.");
  await transact(data => { if (data.tasks.length >= 500) throw new Error("Task history limit reached; archive the data directory before adding tasks."); data.tasks.push(task); }); return task;
}
async function remaining(id: string) {
  const task = (await getStore()).tasks.find(t => t.id === id)!;
  return { tokens: task.budgets.maxTokens - task.usage.inputTokens - task.usage.outputTokens, milliseconds: task.budgets.timeSeconds * 1000 - (task.startedAt ? Date.now() - Date.parse(task.startedAt) : 0), cost: task.budgets.maxCostUsd === null ? null : task.budgets.maxCostUsd - (task.usage.costUsd || 0) };
}
async function checkBudget(id: string) {
  const left = await remaining(id); if (left.tokens <= 0 || left.milliseconds <= 0 || (left.cost !== null && left.cost <= 0)) throw new BudgetError("Configured token/time/cost budget exhausted."); return left;
}
function launch(id: string, job: (signal: AbortSignal) => Promise<void>) {
  if (controllers.size >= 1) throw new Error("Concurrency limit: one active local execution. Cancel or wait for the current run.");
  const controller = new AbortController(); controllers.set(id, controller);
  void job(controller.signal).catch(async error => {
    await mutateTask(id, task => {
      if (task.status === "cancelled") return;
      const next = error instanceof BudgetError || error.name === "TimeoutError" ? "budget_exceeded" : "blocked";
      if (!terminalStates.includes(task.status)) transition(task, next);
      addEvent(task, "error", (error as Error).message);
    }).catch(() => undefined);
  }).finally(() => controllers.delete(id));
}
function feedback(task: Task) {
  const last = task.attempts.at(-1);
  if (!last) return "";
  return JSON.stringify({ failedOrUnverified: last.evaluation?.criteria.filter(c => c.status !== "passed"), findings: last.evaluation?.findings, checks: last.checks.map(c => ({ command: c.command, scope: c.scope, exitCode: c.exitCode, stdout: c.stdout.slice(-5000), stderr: c.stderr.slice(-3000) })), changedFiles: last.changes.map(c => c.path) });
}
async function approvalMatches(task: Task, current: string) {
  if (!task.checks.length) return true;
  return !!task.approval && task.approval.commandsHash === commandsHash(task) && (task.approval.scope === "task" || task.approval.revision === current);
}
async function agentAttempt(id: string, signal: AbortSignal, repair: boolean) {
  await checkBudget(id);
  const beforeTask = (await getStore()).tasks.find(t => t.id === id)!;
  if (beforeTask.attempts.length >= beforeTask.budgets.maxIterations) throw new BudgetError("Iteration budget reached.");
  const before = await snapshot(beforeTask.workspace), repairFeedback = feedback(beforeTask);
  const task = await mutateTask(id, task => {
    if (task.status === "cancelled") throw new DOMException("Cancelled", "AbortError");
    if (!repair) { transition(task, "planning"); task.startedAt ||= new Date().toISOString(); transition(task, "executing"); }
    else if (task.status !== "repairing") transition(task, "repairing");
    task.manualApprovals = []; task.reviewedFindings = [];
    task.attempts.push({ number: task.attempts.length + 1, startedAt: new Date().toISOString(), report: "", checks: [], changes: [], revision: revision(before) });
    return structuredClone(task);
  });
  const duration = (await remaining(id)).milliseconds;
  const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, duration))]);
  let report = "";
  try {
    report = await adapters[task.agent].run({ task, signal: timedSignal, feedback: repairFeedback, emit: (kind, text) => mutateTask(id, task => addEvent(task, kind, text)), remaining: () => remaining(id), account: async usage => { await mutateTask(id, task => { task.usage.incomplete ||= usage.incomplete; task.usage.inputTokens += usage.inputTokens; task.usage.outputTokens += usage.outputTokens; task.usage.costUsd = task.usage.costUsd === null || usage.costUsd === null ? null : task.usage.costUsd + usage.costUsd; }); await checkBudget(id); } });
  } finally {
    const after = await snapshot(task.workspace);
    await mutateTask(id, task => { const attempt = task.attempts.at(-1)!; attempt.report = report; attempt.changes = changes(before, after); attempt.revision = revision(after); if (report) addEvent(task, "agent", report); });
  }
  if (timedSignal.aborted) throw timedSignal.reason;
  await checkBudget(id);
  const updated = (await getStore()).tasks.find(t => t.id === id)!;
  if (!await approvalMatches(updated, updated.attempts.at(-1)!.revision)) await mutateTask(id, task => transition(task, "awaiting_check_approval"));
  else await validate(id, signal);
}
async function validate(id: string, signal: AbortSignal) {
  const task = await mutateTask(id, task => { if (task.status === "cancelled") throw new DOMException("Cancelled", "AbortError"); transition(task, "validating"); return structuredClone(task); });
  const inspected = await snapshot(task.workspace), current = revision(inspected);
  if (current !== task.attempts.at(-1)?.revision || !await approvalMatches(task, current)) throw new Error("Workspace changed after review. Checks need a fresh revision-bound approval.");
  for (const check of task.checks) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const budget = await checkBudget(id);
    if (revision(await snapshot(task.workspace)) !== current) throw new Error("An earlier check modified source. Fresh review required before the next command.");
    await mutateTask(id, task => addEvent(task, "check", `Executing approved argv: ${JSON.stringify(check.command)}; scope=${check.scope}.`));
    const result = await runCheck(task.workspace, check, signal, budget.milliseconds);
    await mutateTask(id, task => { task.attempts.at(-1)!.checks.push(result); addEvent(task, "check", `${check.label}: exit=${result.exitCode}; duration=${result.durationMs}ms; tests=${JSON.stringify(result.tests)}.`); });
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  await checkBudget(id);
  const afterChecks = await snapshot(task.workspace);
  const shouldRepair = await mutateTask(id, task => {
    const attempt = task.attempts.at(-1)!;
    const checkChanges = changes(inspected, afterChecks);
    transition(task, "reviewing");
    attempt.evaluation = evaluate({ criteria: task.criteria, files: afterChecks, checks: attempt.checks, changes: [...attempt.changes, ...checkChanges], claim: attempt.report, previous: task.attempts.slice(0, -1), manualApprovals: task.manualApprovals, reviewedFindings: task.reviewedFindings });
    if (checkChanges.length) { attempt.evaluation.verdict = "unverified"; attempt.evaluation.findings.push({ id: "checks_modified_files", code: "checks_modified_files", severity: "warning", title: "Checks changed imported source files", evidence: checkChanges.map(c => c.path).join(", ") }); attempt.changes.push(...checkChanges); }
    attempt.finishedAt = new Date().toISOString();
    addEvent(task, "boss", roast(task));
    if (attempt.evaluation.verdict === "passed") { transition(task, "completed"); return false; }
    transition(task, "diagnosing");
    if (task.attempts.length >= task.budgets.maxIterations) { transition(task, "budget_exceeded"); return false; }
    if (task.repairMode !== "autonomous" || task.manualApprovals.length > 0 || attempt.evaluation.findings.some(f => f.severity === "warning" && !["repeated_failure"].includes(f.code) && !task.reviewedFindings.includes(f.id))) { transition(task, "awaiting_repair_approval"); return false; }
    transition(task, "repairing"); return true;
  });
  if (shouldRepair) await agentAttempt(id, signal, true);
}
export async function act(id: string, action: string, payload: Record<string, unknown> = {}) {
  const task = (await getStore()).tasks.find(t => t.id === id); if (!task) throw new Error("Task not found.");
  if (action === "cancel") {
    controllers.get(id)?.abort();
    return mutateTask(id, task => { if (terminalStates.includes(task.status)) return { text: "Run already ended; records preserved." }; transition(task, "cancelled"); addEvent(task, "boss", "Fired. Execution cancelled; logs and changed files retained."); return { text: "Cancelled. Evidence retained." }; });
  }
  if (action === "roast") return mutateTask(id, task => { const text = roast(task); addEvent(task, "boss", text); return { text }; });
  if (action === "review") return mutateTask(id, task => performanceReview(task));
  if (action === "next_action") {
    const text = task.status === "awaiting_check_approval" ? "Review the current diff and exact commands, then approve checks. No test has run yet." : task.attempts.at(-1)?.evaluation?.criteria.filter(c => c.status !== "passed").map(c => `${c.label}: ${c.evidence}`).join("\n") || (task.status === "queued" ? "Start the employee; inspect the resulting diff before running checks." : "No unresolved criterion is recorded. Open final review.");
    if (task.agent === "openai" && !terminalStates.includes(task.status) && !activeStates.includes(task.status)) {
      launch(id, async signal => {
        const updated = await mutateTask(id, task => { task.startedAt ||= new Date().toISOString(); addEvent(task, "boss", "NO MORE EXCUSES: requested a read-only next action from the configured employee, with concrete recorded evidence."); return structuredClone(task); });
        const budget = await checkBudget(id), boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, budget.milliseconds))]);
        const report = await adapters.openai.run({ task: updated, readOnly: true, signal: boundedSignal, feedback: `${feedback(updated)}\nManager requires next concrete action, not an explanation. ${text}`, emit: (kind, value) => mutateTask(id, task => addEvent(task, kind, value)), remaining: () => remaining(id), account: async usage => { await mutateTask(id, task => { task.usage.incomplete ||= usage.incomplete; task.usage.inputTokens += usage.inputTokens; task.usage.outputTokens += usage.outputTokens; task.usage.costUsd = task.usage.costUsd === null || usage.costUsd === null ? null : task.usage.costUsd + usage.costUsd; }); await checkBudget(id); } });
        await mutateTask(id, task => addEvent(task, "agent", `Employee next action: ${report}`));
      });
      return { text: "Read-only next-action request sent to the employee. Response will appear in the timeline." };
    }
    await mutateTask(id, t => addEvent(t, "boss", `Next concrete action: ${text}`)); return { text };
  }
  if (action === "accept") {
    if (task.status !== "completed" || task.attempts.at(-1)?.evaluation?.verdict !== "passed") throw new Error("SHIP IT needs completed, passed acceptance evidence.");
    if (revision(await snapshot(task.workspace)) !== task.attempts.at(-1)?.revision) throw new Error("Source changed after verification. Final acceptance requires fresh evidence.");
    return mutateTask(id, task => { task.acceptedAt = new Date().toISOString(); addEvent(task, "approval", "User accepted final diff and evidence. No commit, push, or deployment performed."); return { text: "Review accepted. Files remain in the isolated copy; no repository published." }; });
  }
  if (action === "extra_iteration") {
    const left = await checkBudget(id);
    if (task.budgets.maxIterations >= 10 || !["awaiting_repair_approval", "budget_exceeded"].includes(task.status) || left.milliseconds <= 0 || task.attempts.length < task.budgets.maxIterations) throw new Error("An extra iteration is available only after the iteration limit, within remaining time/token/cost limits.");
    return mutateTask(id, task => { task.budgets.maxIterations++; if (task.status === "budget_exceeded") { task.status = "awaiting_repair_approval"; addEvent(task, "approval", "User granted one additional iteration within hard budget ceilings."); } return { text: "One extra repair iteration granted." }; });
  }
  if (action === "manual_review") {
    if (task.status !== "awaiting_repair_approval" || typeof payload.criterionId !== "string" || !task.criteria.some(c => c.id === payload.criterionId && c.kind === "review")) throw new Error("Manual approval applies only to an explicit human-review criterion after evidence inspection.");
    return mutateTask(id, task => { if (!task.manualApprovals.includes(payload.criterionId as string)) task.manualApprovals.push(payload.criterionId as string); addEvent(task, "approval", `Manual criterion accepted by user: ${payload.criterionId}`); return { text: "Manual criterion accepted. Revalidate to combine with existing check evidence." }; });
  }
  if (action === "review_finding") {
    if (task.status !== "awaiting_repair_approval" || typeof payload.findingId !== "string" || typeof payload.note !== "string" || payload.note.trim().length < 5 || payload.note.length > 1000 || !task.attempts.at(-1)?.evaluation?.findings.some(f => f.id === payload.findingId && f.severity === "warning")) throw new Error("Review an advisory signal with a concrete human explanation; verified failures cannot be dismissed.");
    return mutateTask(id, task => { task.reviewedFindings ||= []; if (!task.reviewedFindings.includes(payload.findingId as string)) task.reviewedFindings.push(payload.findingId as string); addEvent(task, "approval", `Human reviewed advisory ${payload.findingId}: ${payload.note}`); return { text: "Advisory reviewed. Revalidate; verified failures still need fixes." }; });
  }
  if (action === "revalidate") {
    if (task.status !== "awaiting_repair_approval") throw new Error("Revalidate only a reviewed run awaiting repair approval.");
    launch(id, async signal => {
      await mutateTask(id, task => { transition(task, "awaiting_check_approval"); const attempt = task.attempts.at(-1)!; (attempt.priorValidations ||= []).push({ checks: structuredClone(attempt.checks), evaluation: structuredClone(attempt.evaluation), at: new Date().toISOString() }); attempt.checks = []; addEvent(task, "state", "Revalidation requested without an agent edit."); });
      await validate(id, signal);
    }); return { text: "Revalidation started." };
  }
  if (action === "start") {
    if (task.status !== "queued") throw new Error("Only queued tasks can start.");
    launch(id, signal => agentAttempt(id, signal, false)); return { text: "Employee started." };
  }
  if (action === "repair") {
    if (task.status !== "awaiting_repair_approval") throw new Error("Repair requires a failed or unverified run awaiting review.");
    launch(id, signal => agentAttempt(id, signal, true)); return { text: "Concrete failure evidence sent to the employee." };
  }
  if (action === "approve_checks") {
    if (task.status !== "awaiting_check_approval") throw new Error("Check approval requires the latest inspected agent revision.");
    if (payload.scope !== "revision" && payload.scope !== "task") throw new Error("Specify revision or task-wide approval.");
    const latest = revision(await snapshot(task.workspace));
    if (latest !== payload.revision || latest !== task.attempts.at(-1)?.revision) throw new Error("Approval revision mismatch. Reload the diff.");
    for (const check of task.checks) await inspectCheck(task.workspace, check);
    if (controllers.size) throw new Error("Execution still finishing; retry after the current job ends.");
    await mutateTask(id, task => { task.approval = { scope: payload.scope as "revision" | "task", revision: latest, commandsHash: commandsHash(task), at: new Date().toISOString() }; addEvent(task, "approval", `${payload.scope === "task" ? "User explicitly approved these commands for all source revisions in this bounded task" : "User approved exact commands for this inspected revision"}. Restricted local execution is NOT an OS sandbox.`); });
    launch(id, signal => validate(id, signal)); return { text: "Approved checks started." };
  }
  throw new Error("Unknown boss action.");
}
export function fixtureInput(): TaskInput {
  return taskInputSchema.parse({ title: "Fix the addition employee", description: "Make sum(a, b) add positive, negative, and zero operands. Preserve the existing three tests.", source: "fixture", agent: "fixture", repairMode: "supervised", humor: "sarcastic", criteria: [{ id: "source", label: "Addition source exists", kind: "file_exists", required: true, path: "sum.js" }, { id: "tests", label: "Full addition suite passes", kind: "check_passes", required: true, checkId: "tests" }], checks: [{ id: "tests", label: "Node addition tests", kind: "test", command: ["node", "--test", "tests/sum.test.js"], scope: "full" }], budgets: { maxIterations: 3, timeSeconds: 600, maxTokens: 30000, maxCostUsd: null } });
}
export { activeStates };
