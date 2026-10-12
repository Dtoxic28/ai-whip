import { z } from "zod";
import { authorize, tokenMatches } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { act, createTask, fixtureInput } from "@/lib/orchestrator";
import { publicTask } from "@/lib/domain";
import { snapshot } from "@/lib/workspace";
import { redact } from "@/lib/security";
import { configuredRates } from "@/lib/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 64000) throw new Error("Request body exceeds 64 KB.");
  const text = await request.text(); if (Buffer.byteLength(text) > 64000) throw new Error("Request body exceeds 64 KB.");
  return JSON.parse(text) as unknown;
}
async function handle(request: Request, path: string[]) {
  const rejected = authorize(request, path[0] === "auth"); if (rejected) return rejected;
  if (path[0] === "auth" && request.method === "POST") {
    const input = z.object({ token: z.string().max(500) }).parse(await body(request));
    if (!tokenMatches(input.token)) return json({ error: "Incorrect access token." }, 401);
    return new Response(JSON.stringify({ authenticated: true }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": `whip_auth=${encodeURIComponent(input.token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
  }
  if (path[0] === "config" && request.method === "GET") return json({ realAgentConfigured: !!process.env.OPENAI_API_KEY && !!process.env.OPENAI_MODEL, model: process.env.OPENAI_MODEL || null, ratesConfigured: !!configuredRates(), executionMode: "restricted_local_approval", concurrency: 1, authenticationEnabled: !!process.env.AI_WHIP_AUTH_TOKEN, fixture: fixtureInput() });
  if (path[0] === "tasks" && path.length === 1) {
    if (request.method === "GET") return json({ tasks: (await getStore()).tasks.map(publicTask) });
    if (request.method === "POST") return json({ task: publicTask(await createTask(await body(request))) }, 201);
  }
  if (path[0] === "tasks" && path[1]) {
    const task = (await getStore()).tasks.find(t => t.id === path[1]); if (!task) return json({ error: "Task not found." }, 404);
    if (request.method === "GET") {
      if (path[2] === "files") return json({ files: Object.fromEntries(Object.entries(await snapshot(task.workspace)).map(([name, contents]) => [name, redact(contents)])) });
      if (path[2] === "export") return new Response(JSON.stringify({ ...publicTask(task), exportedAt: new Date().toISOString() }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ai-whip-${task.id}.json"`, "Cache-Control": "no-store" } });
      return json({ task: publicTask(task) });
    }
    if (request.method === "POST" && path[2] === "actions") {
      const input = z.object({ action: z.string().max(50), payload: z.record(z.string(), z.unknown()).default({}) }).parse(await body(request));
      return json({ result: await act(task.id, input.action, input.payload) });
    }
  }
  return json({ error: "Endpoint not found." }, 404);
}
async function route(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try { return await handle(request, (await context.params).path); }
  catch (error) { return json({ error: redact(error instanceof z.ZodError ? error.issues.map(i => i.message).join(" ") : (error as Error).message) }, 400); }
}
export const GET = route;
export const POST = route;
