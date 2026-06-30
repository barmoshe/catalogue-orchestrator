import { ffmpegPath } from "../media/ffmpegPath";
import { run, runOrThrow } from "../media/spawn";
import { probe } from "../media/ffprobe";
import type { CompilePlan, FfmpegJob } from "./edlToFfmpeg";

export type RenderProgress = { stage: string; index: number; total: number; pct: number };

// Renders are processes, not function calls: serialize them so two jobs don't fight over
// CPU or temp paths (AGENTS rule 7). A simple promise chain is the lock.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export type RunResultInfo = {
  outFile: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
};

/**
 * Execute a CompilePlan: each segment job, then concat, then optional music mix, then
 * ffprobe-verify the output. Serialized behind the render lock. The caller owns temp-dir
 * creation/cleanup (compile.ts); this layer only runs ffmpeg and verifies.
 */
export function executePlan(
  plan: CompilePlan,
  opts: { totalDurationSec?: number; onProgress?: (p: RenderProgress) => void } = {},
): Promise<RunResultInfo> {
  return serialized(async () => {
    const jobs: FfmpegJob[] = [
      ...plan.segmentJobs,
      plan.concatJob,
      ...(plan.mixJob ? [plan.mixJob] : []),
    ];
    const total = jobs.length;
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      await runOrThrow(ffmpegPath(), job.args, {
        totalSec: opts.totalDurationSec,
        onProgress: (pct) => opts.onProgress?.({ stage: job.name, index: i, total, pct }),
      });
      opts.onProgress?.({ stage: job.name, index: i, total, pct: 1 });
    }

    const info = await probe(plan.finalFile);
    if (!info || (info.durationSec ?? 0) <= 0) {
      throw new Error(`render produced no/empty output at ${plan.finalFile}`);
    }
    return {
      outFile: plan.finalFile,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
    };
  });
}

/** Extract a single still from a rendered file (for a preview thumbnail). */
export async function extractThumb(videoPath: string, atSec: number, destPath: string): Promise<boolean> {
  const res = await run(ffmpegPath(), [
    "-hide_banner", "-ss", atSec.toFixed(2), "-i", videoPath, "-frames:v", "1", "-q:v", "3", "-y", destPath,
  ]);
  return res.code === 0;
}
