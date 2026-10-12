import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { safePath, protectedWrite, redact } from "../src/lib/security";
import { writeWorkspaceFile, snapshot } from "../src/lib/workspace";
import { authorize } from "../src/lib/auth";
import { taskInputSchema, checkSchema } from "../src/lib/domain";
import { fixtureInput } from "../src/lib/orchestrator";
let root: string;
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); delete process.env.AI_WHIP_AUTH_TOKEN; delete process.env.AI_WHIP_ALLOW_REMOTE; });
describe("restricted tools", () => {
  it.each(["../secret", "/tmp/escape", "C:/Windows/x", "..\\outside", ".env.local", "a/../../x", "a/.git/config", "file:stream", "a\0b", "CON.js", "src./a.js", "secret.txt "])("rejects %s", name => expect(() => safePath("/workspace", name)).toThrow());
  it("protects tests and execution manifests", () => { for (const name of ["tests/a.js", "a.test.ts", "package.json", "package-lock.json", ".github/workflows/ci.yml"]) expect(protectedWrite(name)).toBe(true); expect(protectedWrite("src/sum.ts")).toBe(false); });
  it("redacts exact secrets and common credentials", () => { const output = redact("secretvalue sk-abcdef123456789 bearer abcdtoken password=hunter2", ["secretvalue"]); expect(output).not.toContain("secretvalue"); expect(output).not.toContain("hunter2"); expect(output).not.toContain("abcdtoken"); });
  it("writes source but refuses test edits", async () => { root = await mkdtemp(path.join(os.tmpdir(), "whip-security-")); await writeWorkspaceFile(root, "src/a.ts", "export const a = 1;"); await expect(writeWorkspaceFile(root, "tests/a.test.ts", "")).rejects.toThrow(); expect(await snapshot(root)).toEqual({ "src/a.ts": "export const a = 1;" }); });
  it("does not copy secrets", async () => { root = await mkdtemp(path.join(os.tmpdir(), "whip-secret-")); await writeFile(path.join(root, ".env"), "API_KEY=hidden"); await writeFile(path.join(root, "a.js"), "hello"); expect(await snapshot(root)).toEqual({ "a.js": "hello" }); });
  it("rejects directory junctions/symlinks", async () => { root = await mkdtemp(path.join(os.tmpdir(), "whip-link-")); const outside = await mkdtemp(path.join(os.tmpdir(), "whip-outside-")); try { await mkdir(path.join(root, "src")); await symlink(outside, path.join(root, "src/link"), process.platform === "win32" ? "junction" : "dir"); await expect(writeWorkspaceFile(root, "src/link/a.ts", "x")).rejects.toThrow(/Symlink/); } finally { await rm(outside, { recursive: true, force: true }); } });
  it("rejects arbitrary shell, installs, and node eval", () => { for (const command of [["cmd", "/c", "echo hello"], ["npm", "install", "x"], ["node", "--eval", "x"], ["npx", "anything"]]) expect(checkSchema.safeParse({ id: "check", label: "x", kind: "custom", command }).success).toBe(false); });
  it("validates criterion links and task budgets", () => { const fixture = fixtureInput(); expect(taskInputSchema.safeParse({ ...fixture, budgets: { ...fixture.budgets, maxIterations: 500 } }).success).toBe(false); expect(taskInputSchema.safeParse({ ...fixture, checks: [] }).success).toBe(false); });
});
describe("local authorization", () => {
  const request = (host: string, origin?: string) => new Request(`http://${host}/api/tasks`, { method: "POST", headers: { host, ...(origin ? { origin } : {}) } });
  it("rejects cross-origin local mutations", () => expect(authorize(request("localhost:3000", "https://evil.example"))?.status).toBe(403));
  it("requires an origin for anonymous mutation", () => expect(authorize(request("localhost:3000"))?.status).toBe(403));
  it("accepts same-origin loopback", () => expect(authorize(request("127.0.0.1:3000", "http://127.0.0.1:3000"))).toBeNull());
  it("rejects remote hosts by default", () => expect(authorize(request("public.example", "http://public.example"))?.status).toBe(403));
  it("keeps server tokens out of unauthenticated requests", () => { process.env.AI_WHIP_AUTH_TOKEN = "test-token"; expect(authorize(new Request("http://localhost/api/config"))?.status).toBe(401); expect(authorize(new Request("http://localhost/api/config", { headers: { authorization: "Bearer test-token" } }))).toBeNull(); });
});
