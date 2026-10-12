import { spawn } from "node:child_process";
import path from "node:path";
import { stat, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { checkSchema, type Check, type CheckResult } from "./domain";
import { parseTestCounts } from "./detector";
import { redact, safePath, guardSymlinks } from "./security";

const outputLimit = 100000;
export async function inspectCheck(workspace: string, check: Check) {
  checkSchema.parse(check);
  if (check.command[0] === "npm") {
    const manifest = JSON.parse(await readFile(safePath(workspace, "package.json"), "utf8"));
    const scriptName = check.command[1] === "test" ? "test" : check.command[2];
    const scripts = [manifest.scripts?.[`pre${scriptName}`], manifest.scripts?.[scriptName], manifest.scripts?.[`post${scriptName}`]].filter(Boolean);
    if (!scripts.length) throw new Error(`Missing npm script ${scriptName}.`);
    return scripts.map(String).join("\n");
  }
  let found = false;
  for (const arg of check.command.slice(1)) {
    if (arg.startsWith("-")) continue;
    if (path.isAbsolute(arg) || arg.includes("..") || arg.includes("\\") || arg.includes(":")) throw new Error("Check paths must stay in the copied workspace.");
    const target = safePath(workspace, arg); await guardSymlinks(workspace, target);
    if ((await stat(target)).isFile()) found = true;
  }
  if (!found) throw new Error("Node checks must name an inspected workspace file.");
  return "Direct Node process; inspected script bytes shown by revision-bound approval.";
}
export async function runCheck(workspace: string, check: Check, signal: AbortSignal, timeoutMs: number): Promise<CheckResult> {
  await inspectCheck(workspace, check);
  const start = performance.now();
  // Restricted local mode is not an OS sandbox. No AI-generated shell command is accepted.
  const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const args = check.command[0] === "npm" ? [npmCli, ...check.command.slice(1)] : check.command.slice(1);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: path.dirname(process.execPath), HOME: workspace, USERPROFILE: workspace, TMP: workspace, TEMP: workspace, TMPDIR: workspace, LANG: "C.UTF-8", CI: "1", NO_COLOR: "1" };
  if (process.platform === "win32") { env.SystemRoot = process.env.SystemRoot; env.ComSpec = process.env.ComSpec; env.PATHEXT = process.env.PATHEXT; }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: workspace, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false, outputLimited = false, killed = false;
    const kill = () => {
      if (killed) return; killed = true;
      if (process.platform === "win32" && child.pid) {
        const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
        spawn(taskkill, ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
      } else if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, Math.max(1, Math.min(timeoutMs, 60000)));
    const collect = (destination: "stdout" | "stderr", bytes: Buffer) => {
      const text = bytes.toString("utf8");
      if (destination === "stdout") stdout += text; else stderr += text;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > outputLimit) { outputLimited = true; stdout = stdout.slice(0, outputLimit / 2); stderr = stderr.slice(0, outputLimit / 2); kill(); }
    };
    child.stdout.on("data", bytes => collect("stdout", bytes)); child.stderr.on("data", bytes => collect("stderr", bytes));
    const abort = () => kill(); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) kill();
    child.on("error", error => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(error); });
    child.on("close", code => {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
      resolve({ ...check, exitCode: code, stdout: redact(stdout), stderr: redact(stderr), durationMs: Math.round(performance.now() - start), timedOut, outputLimited, tests: check.kind === "test" ? parseTestCounts(stdout) : null });
    });
  });
}
