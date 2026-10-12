import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { adapters, type AgentContext, BudgetError } from "../src/lib/agents";
import { fixtureInput } from "../src/lib/orchestrator";
import type { Task } from "../src/lib/domain";
let root: string;
afterEach(async () => { vi.unstubAllGlobals(); delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_MODEL; delete process.env.OPENAI_INPUT_USD_PER_MILLION; delete process.env.OPENAI_OUTPUT_USD_PER_MILLION; if(root) await rm(root,{recursive:true,force:true}); });
async function context(): Promise<AgentContext> { root=await mkdtemp(path.join(os.tmpdir(),"whip-agent-")); process.env.OPENAI_API_KEY="sk-test-secret-value"; process.env.OPENAI_MODEL="configured-model"; return { task:{...fixtureInput(),agent:"openai",workspace:root,attempts:[{number:1}],id:"task"} as Task, signal:new AbortController().signal,feedback:"Exact test failed: sum(2,3) expected 5",emit:vi.fn(async()=>{}),account:vi.fn(async()=>{}),remaining:async()=>({tokens:30000,milliseconds:10000,cost:null}) }; }
it("implements Responses function calls as actual restricted source writes", async()=>{
 const ctx=await context(); const requestBodies: Record<string,unknown>[]=[];
 const mock=vi.fn(async(_url:unknown,init:RequestInit)=>{requestBodies.push(JSON.parse(String(init.body)));const output=requestBodies.length===1?[{type:"function_call",name:"report_plan",arguments:JSON.stringify({plan:"Inspect addition source, implement arithmetic without weakening tests."}),call_id:"plan-1"}]:requestBodies.length===2?[{type:"function_call",name:"write_file",arguments:JSON.stringify({path:"sum.js",content:"export const sum = (a,b) => a+b;"}),call_id:"call-1"}]:[{type:"message",content:[{type:"output_text",text:"Changed sum.js; tests not executed."}]}];return Response.json({output,usage:{input_tokens:50,output_tokens:20}});});
 vi.stubGlobal("fetch",mock); const report=await adapters.openai.run(ctx);expect(await readFile(path.join(root,"sum.js"),"utf8")).toContain("a+b");expect(report).toContain("not executed");expect(requestBodies[2].input).toEqual(expect.arrayContaining([expect.objectContaining({type:"function_call_output",call_id:"call-1"})]));expect(requestBodies[0].store).toBe(false);expect(ctx.account).toHaveBeenCalledTimes(3);
});
it("normalizes provider errors without leaking keys", async()=>{const ctx=await context();vi.stubGlobal("fetch",vi.fn(async()=>new Response('sk-test-secret-value',{status:429})));await expect(adapters.openai.run(ctx)).rejects.toThrow("[REDACTED]"); expect(ctx.account).toHaveBeenCalledWith({ inputTokens: 0, outputTokens: 0, costUsd: null, incomplete: true });});
it("does not call a provider beyond token reservation", async()=>{const ctx=await context();ctx.remaining=async()=>({tokens:100,milliseconds:10000,cost:null});const mocked=vi.fn();vi.stubGlobal("fetch",mocked);await expect(adapters.openai.run(ctx)).rejects.toBeInstanceOf(BudgetError);expect(mocked).not.toHaveBeenCalled();});
it("rejects real integration when unconfigured", async()=>{const ctx=await context();delete process.env.OPENAI_API_KEY;await expect(adapters.openai.run(ctx)).rejects.toThrow(/Configure/);});

it("next-action mode omits writes and rejects provider attempts to write", async () => {
  const ctx = await context(); ctx.readOnly = true; const bodies: { tools: { name: string }[]; input: { type?: string; output?: string }[] }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return Response.json({ output: bodies.length === 1 ? [{ type: "function_call", name: "write_file", arguments: JSON.stringify({ path: "a.js", content: "bad" }), call_id: "reject-write" }] : [{ type: "message", content: [{ type: "output_text", text: "Next action: inspect the failing assertion, then repair the source." }] }], usage: { input_tokens: 30, output_tokens: 10 } }); }));
  expect(await adapters.openai.run(ctx)).toContain("Next action"); expect(bodies[0].tools.some(t => t.name === "write_file")).toBe(false);
  await expect(readFile(path.join(root, "a.js"), "utf8")).rejects.toThrow(); expect(JSON.stringify(bodies[1].input)).toContain("Read-only request rejects");
});
