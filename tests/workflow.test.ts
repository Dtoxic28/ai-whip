import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createTask, fixtureInput, act, transition } from "../src/lib/orchestrator";
import { getStore, mutateTask } from "../src/lib/store";
import type { Status, Task } from "../src/lib/domain";
let directory: string;
beforeAll(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "whip-workflow-")); process.env.AI_WHIP_DATA_DIR = directory; });
afterAll(async () => { delete process.env.AI_WHIP_DATA_DIR; await rm(directory, { recursive: true, force: true }); });
async function waitFor(id: string, status: Status) { for (let i=0; i<150; i++) { const task = (await getStore()).tasks.find(t => t.id === id)!; if (task.status === status) { await new Promise(resolve => setTimeout(resolve, 30)); return task; } if (["blocked","cancelled"].includes(task.status)) throw new Error(JSON.stringify(task.events)); await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error(`State timeout: ${status}`); }
async function approve(task: Task, scope = "revision") { await act(task.id, "approve_checks", { scope, revision: task.attempts.at(-1)!.revision }); }
it("runs failed fixture checks, records false claim, repairs, verifies, accepts; originals intact", async () => {
  const original = await readFile("fixtures/tiny-project/sum.js", "utf8"), task = await createTask(fixtureInput());
  await act(task.id, "start"); const pending = await waitFor(task.id, "awaiting_check_approval"); expect(pending.attempts[0].checks).toHaveLength(0);
  await expect(act(task.id, "approve_checks", { scope: "revision", revision: "stale" })).rejects.toThrow(/revision/i);
  await approve(pending); const failed = await waitFor(task.id, "awaiting_repair_approval"); expect(failed.attempts[0].checks[0].exitCode).toBe(1); expect(failed.attempts[0].evaluation?.findings.some(f => f.code === "contradicted_test_claim")).toBe(true);
  const roast = await act(task.id, "roast"); expect(roast).toBeTruthy(); await expect(act(task.id, "accept")).rejects.toThrow(/SHIP IT/);
  await act(task.id, "repair"); const repaired = await waitFor(task.id, "awaiting_check_approval"); expect(repaired.attempts).toHaveLength(2); expect(repaired.attempts[1].changes[0].after).toContain("a + b");
  await approve(repaired); const passed = await waitFor(task.id, "completed"); expect(passed.attempts[1].checks[0].tests).toEqual({ total: 3, passed: 3, failed: 0, skipped: 0 }); expect(passed.attempts[1].evaluation?.verdict).toBe("passed"); await act(task.id, "accept"); expect((await getStore()).tasks.find(t => t.id === task.id)?.acceptedAt).toBeTruthy(); expect(await readFile("fixtures/tiny-project/sum.js", "utf8")).toBe(original);
});
it("autonomous repairs require explicit mode and task-wide check approval", async () => { const input = fixtureInput(); input.repairMode = "autonomous"; const task = await createTask(input); await act(task.id, "start"); await approve(await waitFor(task.id, "awaiting_check_approval"), "task"); const passed = await waitFor(task.id, "completed"); expect(passed.attempts).toHaveLength(2); expect(passed.events.some(e => e.kind === "approval" && e.text.includes("all source revisions"))).toBe(true); });
it("stops at the iteration ceiling; permits one explicit extension", async () => { const input=fixtureInput(); input.budgets.maxIterations=1; const task=await createTask(input); await act(task.id,"start"); await approve(await waitFor(task.id,"awaiting_check_approval")); const stopped=await waitFor(task.id,"budget_exceeded"); expect(stopped.attempts).toHaveLength(1); await act(task.id,"extra_iteration"); await act(task.id,"repair"); await approve(await waitFor(task.id,"awaiting_check_approval")); expect((await waitFor(task.id,"completed")).attempts).toHaveLength(2); });
it("cancels queued tasks and preserves history", async () => { const task=await createTask(fixtureInput()); await act(task.id,"cancel"); const stored=(await getStore()).tasks.find(t=>t.id===task.id)!; expect(stored.status).toBe("cancelled"); expect(stored.events.length).toBeGreaterThan(1); await expect(act(task.id,"start")).rejects.toThrow(); });
it("blocks a expired wall-clock budget before checks", async () => { const task=await createTask(fixtureInput()); await act(task.id,"start"); const pending=await waitFor(task.id,"awaiting_check_approval"); await mutateTask(task.id,t=>{t.startedAt=new Date(Date.now()-700000).toISOString();}); await approve(pending); const stopped=await waitFor(task.id,"budget_exceeded"); expect(stopped.attempts[0].checks).toHaveLength(0); });
it("rejects invalid lifecycle transitions", () => { const task={status:"completed",events:[],attempts:[]} as unknown as Task; expect(()=>transition(task,"executing")).toThrow(/Invalid transition/); });

it("preserves prior validations when a human-review criterion is accepted", async () => {
  const input = fixtureInput(); input.criteria.push({ id: "human", label: "Human semantics reviewed", kind: "review", required: true });
  const task = await createTask(input); await act(task.id, "start"); await approve(await waitFor(task.id, "awaiting_check_approval")); await waitFor(task.id, "awaiting_repair_approval");
  await act(task.id, "repair"); await approve(await waitFor(task.id, "awaiting_check_approval")); await waitFor(task.id, "awaiting_repair_approval");
  await act(task.id, "manual_review", { criterionId: "human" }); await act(task.id, "revalidate"); const complete = await waitFor(task.id, "completed");
  expect(complete.attempts[1].priorValidations).toHaveLength(1); expect(complete.attempts[1].priorValidations![0].checks[0].exitCode).toBe(0); expect(complete.attempts[1].checks[0].exitCode).toBe(0);
});

it("rejects final acceptance after an external source change", async () => {
  const input = fixtureInput(); input.repairMode = "autonomous"; const task = await createTask(input); await act(task.id, "start"); await approve(await waitFor(task.id, "awaiting_check_approval"), "task"); await waitFor(task.id, "completed");
  await writeFile(path.join(task.workspace, "sum.js"), "export function sum() { return 0; }\n"); await expect(act(task.id, "accept")).rejects.toThrow(/changed after verification/);
});
