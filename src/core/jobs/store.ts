import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { EDL } from "../schema/edl";
import { runtimeDir } from "../compile/compile";

export const JobStatus = z.enum(["queued", "processing", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobRecord = z.object({
  id: z.string(),
  status: JobStatus,
  title: z.string(),
  mode: z.enum(["highlights", "assembly"]),
  edl: EDL,
  progress: z.number().min(0).max(1).default(0),
  stage: z.string().default(""),
  width: z.number().nullable().default(null),
  height: z.number().nullable().default(null),
  durationSec: z.number().nullable().default(null),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRecord = z.infer<typeof JobRecord>;

const JobsFile = z.object({ jobs: z.array(JobRecord) });

// In-memory read-through cache, mirrored to runtime/jobs.json. Local-first + single
// process, so a plain JSON mirror is enough (no external queue); crash recovery re-reads
// the file on boot and re-queues anything left mid-flight.
const store = new Map<string, JobRecord>();
let loaded = false;

function jobsPath(): string {
  return join(runtimeDir(), "jobs.json");
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const p = jobsPath();
  if (existsSync(p)) {
    try {
      const parsed = JobsFile.parse(JSON.parse(await readFile(p, "utf8")));
      for (const j of parsed.jobs) store.set(j.id, j);
    } catch { /* start clean if the file is corrupt */ }
  }
}

async function persist(): Promise<void> {
  await mkdir(runtimeDir(), { recursive: true });
  const jobs = [...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  await writeFile(jobsPath(), JSON.stringify({ jobs }, null, 2), "utf8").catch(() => {});
}

export async function putJob(rec: JobRecord): Promise<void> {
  await ensureLoaded();
  store.set(rec.id, rec);
  await persist();
}

export async function patchJob(id: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
  await ensureLoaded();
  const cur = store.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: nowIso() };
  store.set(id, next);
  await persist();
  return next;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  await ensureLoaded();
  return store.get(id) ?? null;
}

export async function listJobs(): Promise<JobRecord[]> {
  await ensureLoaded();
  return [...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function nowIso(): string {
  // Date is allowed in app/runtime code (not in workflow scripts); used for stamps only.
  return new Date().toISOString();
}
