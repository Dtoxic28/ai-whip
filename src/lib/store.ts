import { mkdir, readFile, open, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataDir } from "./workspace";
import { activeStates, type Store, type Task } from "./domain";
import { redact } from "./security";

// ponytail: one server process; use a transactional DB/job queue before horizontal scaling.
let chain: Promise<unknown> = Promise.resolve();
const readyRoots = new Set<string>();
async function load(): Promise<Store> {
  const directory = dataDir(); await mkdir(directory, { recursive: true });
  if (!readyRoots.has(directory)) {
    const lockPath = path.join(directory, "server.lock");
    try { const lock = await open(lockPath, "wx"); await lock.writeFile(String(process.pid)); await lock.close(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(await readFile(lockPath, "utf8"));
      if (pid !== process.pid) {
        let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* Stale process lock. */ }
        if (alive) throw new Error("Another AI Whip process owns this data directory.");
        const lock = await open(lockPath, "w"); await lock.writeFile(String(process.pid)); await lock.close();
      }
    }
    readyRoots.add(directory);
    const recovered = await readDisk();
    let dirty = false;
    for (const task of recovered.tasks) if (activeStates.includes(task.status)) { task.status = "blocked"; addEvent(task, "error", "Server restarted during execution. Prior evidence preserved; review before retrying."); dirty = true; }
    if (dirty) await save(recovered);
  }
  return readDisk();
}
async function readDisk(): Promise<Store> {
  try {
    const raw = await readFile(path.join(dataDir(), "state.json"), "utf8");
    const data = JSON.parse(raw) as Store;
    if (data.version !== 1 || !Array.isArray(data.tasks)) throw new Error("Unsupported or corrupt history. Original data preserved.");
    for (const task of data.tasks) { task.reviewedFindings ||= []; task.model ||= null; task.comparisonKey ||= null; }
    return data;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, tasks: [] }; throw error; }
}
async function save(data: Store) {
  const target = path.join(dataDir(), "state.json"); const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, target);
}
export function transact<T>(fn: (data: Store) => T | Promise<T>, persist = true): Promise<T> {
  const operation = chain.then(async () => { const data = await load(); const result = await fn(data); if (persist) await save(data); return result; });
  chain = operation.catch(() => undefined); return operation;
}
export function getStore() { return transact(data => structuredClone(data), false); }
export function mutateTask<T>(id: string, fn: (task: Task) => T | Promise<T>) {
  return transact(data => { const task = data.tasks.find(t => t.id === id); if (!task) throw new Error("Task not found."); return fn(task); });
}
export function addEvent(task: Task, kind: Task["events"][number]["kind"], text: string) {
  task.events.push({ id: randomUUID(), at: new Date().toISOString(), kind, text: redact(text).slice(0, 12000), attempt: task.attempts.length });
  if (task.events.length > 500) task.events.splice(0, task.events.length - 500);
}
