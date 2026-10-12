import path from "node:path";
import { mkdir, readdir, readFile, writeFile, lstat, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { safePath, guardSymlinks, protectedWrite } from "./security";
import type { FileChange, TaskInput } from "./domain";

export const dataDir = () => path.resolve(/* turbopackIgnore: true */ process.env.AI_WHIP_DATA_DIR || ".data");
const ignored = new Set([".git", "node_modules", ".next", ".data", ".verification", ".ssh", "dist", "build", "coverage"]);
export async function snapshot(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let totalBytes = 0;
  async function walk(relative: string) {
    const directory = relative ? safePath(root, relative) : root;
    await guardSymlinks(root, directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name) || /^\.env|credentials|^\.npmrc|^\.yarnrc/i.test(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error("Project contains a symlink. Remove it before import.");
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const full = safePath(root, name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        const stat = await lstat(full);
        if (stat.size > 100000) throw new Error(`File too large for restricted mode: ${name}`);
        const bytes = await readFile(full);
        if (bytes.includes(0)) continue;
        totalBytes += bytes.length;
        if (Object.keys(files).length >= 300 || totalBytes > 2000000) throw new Error("Project exceeds restricted-mode import limits (300 text files / 2 MB).");
        files[name] = bytes.toString("utf8");
      }
    }
  }
  await walk("");
  return files;
}
export function revision(files: Record<string, string>) { return createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex"); }
export function changes(before: Record<string, string>, after: Record<string, string>): FileChange[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().filter(key => before[key] !== after[key]).map(key => ({ path: key, before: before[key] ?? null, after: after[key] ?? null }));
}
export async function createWorkspace(id: string, input: TaskInput) {
  const root = input.source === "fixture" ? path.resolve("fixtures/tiny-project") : safePath(path.resolve(/* turbopackIgnore: true */ process.env.AI_WHIP_PROJECTS_ROOT || "projects"), input.project!);
  const baseRoot = input.source === "fixture" ? path.resolve("fixtures") : path.resolve(/* turbopackIgnore: true */ process.env.AI_WHIP_PROJECTS_ROOT || "projects");
  await guardSymlinks(baseRoot, root);
  const baseline = await snapshot(root);
  if (!Object.keys(baseline).length) throw new Error("Project contains no importable text files.");
  const workspace = path.join(dataDir(), "workspaces", id);
  await mkdir(workspace, { recursive: true });
  for (const name of Object.keys(baseline)) {
    const target = safePath(workspace, name);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(safePath(root, name), target);
  }
  return { workspace, baseline };
}
export async function readWorkspaceFile(root: string, relative: string) {
  const target = safePath(root, relative); await guardSymlinks(root, target);
  const stat = await lstat(target); if (!stat.isFile() || stat.size > 100000) throw new Error("Only text files up to 100 KB may be read.");
  const text = await readFile(target, "utf8"); if (text.includes("\0")) throw new Error("Binary reads are not supported."); return text;
}
export async function writeWorkspaceFile(root: string, relative: string, content: string) {
  const target = safePath(root, relative);
  if (protectedWrite(relative)) throw new Error("Agent edits to tests, manifests, lockfiles, configuration, or non-source files need human review. This adapter has no destructive tool.");
  if (Buffer.byteLength(content) > 100000 || content.includes("\0")) throw new Error("Source write exceeds the text-file limit.");
  await guardSymlinks(root, target);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}
