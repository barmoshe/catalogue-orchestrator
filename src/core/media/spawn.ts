import { spawn } from "node:child_process";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RunOptions = {
  /** Called as ffmpeg reports progress (0..1), when a total duration is known. */
  onProgress?: (pct: number) => void;
  /** Total media duration in seconds, to compute progress from `time=` in stderr. */
  totalSec?: number;
  /** Register the child so it can be killed (cancellation). */
  onChild?: (child: ReturnType<typeof spawn>) => void;
};

/**
 * Run a binary with an explicit arg ARRAY (never a shell string — AGENTS.md rule 2).
 * Streams stderr, parses ffmpeg `time=HH:MM:SS.ms` for progress, returns captured output.
 */
export function run(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    opts.onChild?.(child);

    let stdout = "";
    let stderr = "";
    const tailMax = 64 * 1024;

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > tailMax) stderr = stderr.slice(-tailMax);
      if (opts.onProgress && opts.totalSec && opts.totalSec > 0) {
        const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
        if (m) {
          const sec = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
          opts.onProgress(Math.max(0, Math.min(1, sec / opts.totalSec)));
        }
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Like run(), but rejects with stderr tail on a non-zero exit. */
export async function runOrThrow(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const res = await run(bin, args, opts);
  if (res.code !== 0) {
    const tail = res.stderr.split("\n").slice(-20).join("\n");
    throw new Error(`command failed (${res.code}): ${bin}\n${tail}`);
  }
  return res;
}
