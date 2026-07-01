import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ffmpegPath } from "../media/ffmpegPath";
import { run } from "../media/spawn";
import type { Window } from "./sceneDetect";

/**
 * Extract ONE representative keyframe per window (at its midpoint) — scene-sampled, not
 * per-frame (cost/latency, DESIGN rabbit hole). Returns the keyframe path per window
 * (null if extraction failed). Frames land in `<keyframeDir>/<assetId>-<i>.jpg`.
 */
export async function sampleFrames(
  videoPath: string,
  assetId: string,
  windows: Window[],
  keyframeDir: string,
): Promise<(string | null)[]> {
  await mkdir(keyframeDir, { recursive: true });
  const out: (string | null)[] = [];
  for (let i = 0; i < windows.length; i += 1) {
    const w = windows[i];
    const mid = w.startSec + (w.endSec - w.startSec) / 2;
    const dest = join(keyframeDir, `${assetId}-${i}.jpg`);
    const res = await run(ffmpegPath(), [
      "-hide_banner",
      "-ss",
      mid.toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-y",
      dest,
    ]);
    out.push(res.code === 0 ? dest : null);
  }
  return out;
}

/** Extract a single keyframe for a still image / whole asset (used for images). */
export async function sampleOne(
  srcPath: string,
  assetId: string,
  keyframeDir: string,
): Promise<string | null> {
  await mkdir(keyframeDir, { recursive: true });
  const dest = join(keyframeDir, `${assetId}-0.jpg`);
  const res = await run(ffmpegPath(), [
    "-hide_banner",
    "-i",
    srcPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-y",
    dest,
  ]);
  return res.code === 0 ? dest : null;
}
