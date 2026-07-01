import { ffmpegPath } from "../media/ffmpegPath";
import { run } from "../media/spawn";
import type { ShotType } from "../schema/cards";
import type { Window } from "./sceneDetect";
import type { TranscriptSegment } from "../providers/types";

export type SegmentSignals = {
  motion: number;
  audioEnergy: number;
  speechRatio: number;
  salience: number;
  shotType: ShotType;
};

/**
 * Measure whole-asset audio energy from ffmpeg `volumedetect` mean_volume (dB), mapped
 * to 0..1 over a [-50, 0] dB range. One pass per asset (cheap); per-segment refinement
 * is a later optimization. Returns 0 when there is no audio.
 */
export async function measureAudioEnergy(path: string, hasAudio: boolean): Promise<number> {
  if (!hasAudio) return 0;
  const { stderr } = await run(ffmpegPath(), [
    "-hide_banner",
    "-i",
    path,
    "-af",
    "volumedetect",
    "-vn",
    "-f",
    "null",
    "-",
  ], { keepFullStderr: true });
  const m = /mean_volume:\s*(-?[0-9.]+) dB/.exec(stderr);
  if (!m) return 0;
  const db = parseFloat(m[1]);
  // -50 dB (quiet) -> 0 ; 0 dB (loud) -> 1
  return clamp01((db + 50) / 50);
}

/**
 * Combine the cheap per-window motion (from scene scores), the asset's audio energy, and
 * speech overlap (from transcript timings) into the usability signals each SegmentCard
 * carries — including `salience`, the Mode-A highlight-worthiness pre-score.
 */
export function deriveSegmentSignals(
  window: Window,
  assetAudioEnergy: number,
  transcript: TranscriptSegment[],
): SegmentSignals {
  const dur = Math.max(0.001, window.endSec - window.startSec);
  const speech = overlapSeconds(transcript, window.startSec, window.endSec);
  const speechRatio = clamp01(speech / dur);
  const motion = clamp01(window.motion);
  const audioEnergy = clamp01(assetAudioEnergy);

  // Highlight-worthiness: motion + loudness + a speech bonus. Tuned so a lively, audible,
  // spoken moment scores high and a static silent one scores low.
  const salience = clamp01(0.45 * motion + 0.35 * audioEnergy + 0.2 * speechRatio);

  return { motion, audioEnergy, speechRatio, salience, shotType: "unknown" };
}

function overlapSeconds(segs: TranscriptSegment[], a: number, b: number): number {
  let total = 0;
  for (const s of segs) {
    const lo = Math.max(a, s.start);
    const hi = Math.min(b, s.end);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
