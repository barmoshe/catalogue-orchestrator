import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { EDL } from "../schema/edl";
import { compileEdl, runtimeDir } from "../compile/compile";
import { getJob, listJobs, patchJob, putJob, nowIso, type JobRecord } from "./store";

// Single in-process render worker: a queue drained one job at a time (renders are
// serialized by the compiler's own lock too). Enqueue returns immediately with a job id;
// the UI polls /api/jobs/[id]. No external queue — local-first.
const queue: string[] = [];
let draining = false;
let recovered = false;

/**
 * Boot-time crash recovery: a render interrupted by a restart is left `processing` (or
 * `queued`) in jobs.json but not in the in-memory queue. Reset stuck `processing` back to
 * `queued` and re-enqueue everything pending so it actually runs. Idempotent.
 */
export async function recoverPending(): Promise<void> {
  if (recovered) return;
  recovered = true;
  for (const j of await listJobs()) {
    if (j.status === "processing") await patchJob(j.id, { status: "queued", stage: "requeued", progress: 0 });
    if ((j.status === "queued" || j.status === "processing") && !queue.includes(j.id)) queue.push(j.id);
  }
  if (queue.length) scheduleDrain();
}

export async function enqueueRender(edl: EDL): Promise<JobRecord> {
  await recoverPending();
  const id = randomUUID();
  const rec: JobRecord = {
    id,
    status: "queued",
    title: edl.title,
    mode: edl.mode,
    edl,
    progress: 0,
    stage: "queued",
    width: null,
    height: null,
    durationSec: null,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await putJob(rec);
  queue.push(id);
  void scheduleDrain();
  return rec;
}

/** Where a finished render lives (served by /api/jobs/[id]/video). */
export function outputPathFor(jobId: string): string {
  return join(runtimeDir(), "renders", jobId, "out.mp4");
}

function scheduleDrain(): void {
  if (draining) return;
  draining = true;
  setImmediate(drain);
}

async function drain(): Promise<void> {
  try {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const job = await getJob(id);
      if (!job || job.status !== "queued") continue;
      await runJob(job);
    }
  } finally {
    draining = false;
  }
}

async function runJob(job: JobRecord): Promise<void> {
  await patchJob(job.id, { status: "processing", stage: "starting", progress: 0 });
  try {
    const info = await compileEdl(job.edl, {
      jobId: job.id,
      outFile: outputPathFor(job.id),
      onProgress: (p) => {
        const overall = (p.index + p.pct) / p.total;
        void patchJob(job.id, { progress: overall, stage: p.stage });
      },
    });
    await patchJob(job.id, {
      status: "completed",
      progress: 1,
      stage: "done",
      width: info.width,
      height: info.height,
      durationSec: info.durationSec,
    });
  } catch (err) {
    await patchJob(job.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
  }
}
