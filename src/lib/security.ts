import path from "node:path";
import { realpath, lstat } from "node:fs/promises";

export function redact(text: string, secrets: string[] = [process.env.OPENAI_API_KEY || "", process.env.AI_WHIP_AUTH_TOKEN || ""]) {
  for (const secret of secrets.filter(value => value.length >= 4)) text = text.split(secret).join("[REDACTED]");
  return text.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]").replace(/(bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]").replace(/((?:api[_-]?key|password|secret|token)\s*[:=]\s*["']?)[^\s"',;]+/gi, "$1[REDACTED]");
}
const forbidden = /(^|\/)(\.git|\.env[^/]*|node_modules|\.next|\.data|\.verification|\.ssh|\.npmrc|\.yarnrc|credentials[^/]*)(\/|$)/i;
export function safePath(root: string, relative: string) {
  if (!relative || relative.includes("\0") || relative.includes("\\") || relative.includes(":") || relative.startsWith("/") || relative.split("/").some(p => p === ".." || p === "." || !p) || forbidden.test(relative)) throw new Error("Path rejected: use a non-secret relative workspace path.");
  if (relative.split("/").some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error("Ambiguous or reserved native path rejected.");
  const target = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Path leaves the workspace.");
  return target;
}
export async function guardSymlinks(root: string, target: string) {
  if ((await lstat(root)).isSymbolicLink()) throw new Error("Symlink workspace roots are not allowed.");
  const rootReal = await realpath(root);
  let current = target;
  while (current !== path.resolve(root)) {
    try { const stat = await lstat(current); if (stat.isSymbolicLink()) throw new Error("Symlinks are not allowed in workspaces."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Path leaves the workspace.");
    current = parent;
  }
  if (rootReal !== await realpath(root)) throw new Error("Workspace changed during access.");
}
export function protectedWrite(relative: string) {
  return /(^|\/)(tests?|__tests__|\.github)(\/|$)|\.(test|spec)\.[^/]+$|(^|\/)(package(-lock)?\.json|[^/]*lock[^/]*|tsconfig[^/]*\.json|[^/]*config\.[cm]?[jt]s|\.eslintrc[^/]*|\.prettierrc[^/]*)$/i.test(relative) || !/\.(?:[cm]?[jt]sx?|css|html|md|json|txt)$/.test(relative);
}
