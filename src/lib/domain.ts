import { z } from "zod";
import { redact } from "./security";

const relativePath = z.string().min(1).max(200).refine(value => !value.startsWith("/") && !value.includes("\\") && !value.includes(":") && value.split("/").every(part => part !== ".." && part !== "." && part.length > 0), "Use a relative path without traversal.");
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
export const criterionSchema = z.object({ id, label: z.string().min(1).max(200), kind: z.enum(["file_exists", "file_contains", "no_placeholders", "check_passes", "review"]), required: z.boolean().default(true), path: relativePath.optional(), text: z.string().max(1000).optional(), checkId: id.optional() }).superRefine((value, ctx) => {
  if (["file_exists", "file_contains", "no_placeholders"].includes(value.kind) && !value.path) ctx.addIssue({ code: "custom", message: "File criteria need a path." });
  if (value.kind === "file_contains" && !value.text) ctx.addIssue({ code: "custom", message: "Contains criteria need expected text." });
  if (value.kind === "check_passes" && !value.checkId) ctx.addIssue({ code: "custom", message: "Check criteria need a check ID." });
});
export const checkSchema = z.object({ id, label: z.string().min(1).max(100), kind: z.enum(["test", "lint", "typecheck", "custom"]), command: z.array(z.string().min(1).max(500)).min(2).max(20).refine(argv => {
  if (argv[0] === "node") return argv.slice(1).every(arg => !arg.includes("\0") && (!arg.startsWith("-") || ["--test", "--test-reporter=tap"].includes(arg)));
  return argv[0] === "npm" && ((argv[1] === "test" && argv.length === 2) || (argv[1] === "run" && argv.length === 3 && /^[a-zA-Z0-9:_-]+$/.test(argv[2])));
}, "Use node SCRIPT/--test or npm test/run SCRIPT. No shell, eval, installs, or network commands."), scope: z.enum(["full", "partial", "unknown"]).default("unknown") });
export const budgetsSchema = z.object({ maxIterations: z.number().int().min(1).max(10).default(3), timeSeconds: z.number().int().min(10).max(3600).default(300), maxTokens: z.number().int().min(1024).max(200000).default(30000), maxCostUsd: z.number().positive().max(100).nullable().default(null) });
export const taskInputSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(8000), source: z.enum(["fixture", "project"]), project: relativePath.optional(), agent: z.enum(["fixture", "openai"]), repairMode: z.enum(["manual", "supervised", "autonomous"]).default("supervised"), humor: z.enum(["friendly", "sarcastic", "ruthless", "silent"]).default("sarcastic"), criteria: z.array(criterionSchema).min(1).max(20), checks: z.array(checkSchema).max(10), budgets: budgetsSchema }).superRefine((task, ctx) => {
  if (task.source === "project" && !task.project) ctx.addIssue({ code: "custom", message: "Project source needs a relative project directory." });
  if (task.agent === "fixture" && task.source !== "fixture") ctx.addIssue({ code: "custom", message: "The fixture employee only works on the labeled fixture." });
  if (!task.criteria.some(c => c.required)) ctx.addIssue({ code: "custom", message: "At least one acceptance criterion must be required." });
  if (new Set(task.criteria.map(c => c.id)).size !== task.criteria.length || new Set(task.checks.map(c => c.id)).size !== task.checks.length) ctx.addIssue({ code: "custom", message: "Criterion and check IDs must be unique." });
  for (const criterion of task.criteria) if (criterion.checkId && !task.checks.some(c => c.id === criterion.checkId)) ctx.addIssue({ code: "custom", message: `Unknown check: ${criterion.checkId}` });
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export type Criterion = z.infer<typeof criterionSchema>;
export type Check = z.infer<typeof checkSchema>;
export type Status = "queued" | "planning" | "executing" | "validating" | "reviewing" | "diagnosing" | "awaiting_check_approval" | "awaiting_repair_approval" | "repairing" | "completed" | "failed" | "cancelled" | "blocked" | "budget_exceeded";
export type Verdict = "passed" | "failed" | "unverified" | "blocked";
export interface Event { id: string; at: string; kind: "state" | "agent" | "tool" | "check" | "approval" | "boss" | "error"; text: string; attempt: number; }
export interface TestCounts { total: number; passed: number; failed: number; skipped: number; }
export interface CheckResult extends Check { exitCode: number | null; stdout: string; stderr: string; durationMs: number; timedOut: boolean; outputLimited: boolean; tests: TestCounts | null; }
export interface FileChange { path: string; before: string | null; after: string | null; }
export interface Finding { id: string; code: string; severity: "failure" | "warning" | "unverified"; title: string; evidence: string; confidence?: "high" | "medium"; }
export interface CriterionResult { id: string; label: string; required: boolean; status: Verdict; evidence: string; }
export interface Score { label: string; status: Verdict; detail: string; passed: number | null; total: number | null; }
export interface Evaluation { verdict: Verdict; criteria: CriterionResult[]; findings: Finding[]; scores: Score[]; }
export interface Attempt { number: number; startedAt: string; finishedAt?: string; report: string; checks: CheckResult[]; changes: FileChange[]; evaluation?: Evaluation; revision: string; priorValidations?: { checks: CheckResult[]; evaluation?: Evaluation; at: string }[]; }
export interface Usage { inputTokens: number; outputTokens: number; costUsd: number | null; incomplete?: boolean; }
export interface Task extends TaskInput { id: string; model: string | null; comparisonKey: string | null; createdAt: string; startedAt?: string; status: Status; workspace: string; baseline: Record<string, string>; attempts: Attempt[]; events: Event[]; usage: Usage; approval?: { scope: "revision" | "task"; revision: string; commandsHash: string; at: string }; manualApprovals: string[]; reviewedFindings: string[]; acceptedAt?: string; lastRoast: number; }
export interface Store { version: 1; tasks: Task[]; }
export const activeStates: Status[] = ["planning", "executing", "repairing", "validating", "reviewing", "diagnosing"];
export const terminalStates: Status[] = ["completed", "failed", "cancelled", "blocked", "budget_exceeded"];
export const publicTask = (task: Task) => {
  const { baseline, ...rest } = structuredClone(task); void baseline;
  rest.title = redact(rest.title); rest.description = redact(rest.description);
  for (const attempt of rest.attempts) {
    attempt.report = redact(attempt.report);
    for (const change of attempt.changes) { if (change.before !== null) change.before = redact(change.before); if (change.after !== null) change.after = redact(change.after); }
    for (const check of [...attempt.checks, ...(attempt.priorValidations || []).flatMap(prior => prior.checks)]) { check.stdout = redact(check.stdout); check.stderr = redact(check.stderr); }
    for (const finding of attempt.evaluation?.findings || []) finding.evidence = redact(finding.evidence);
    for (const criterion of attempt.evaluation?.criteria || []) criterion.evidence = redact(criterion.evidence);
  }
  return rest;
};
export type PublicTask = ReturnType<typeof publicTask>;
