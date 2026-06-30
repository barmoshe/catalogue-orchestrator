import { ffmpegPath } from "../media/ffmpegPath";
import { run } from "../media/spawn";

export type Window = { startSec: number; endSec: number; motion: number };

const MIN_SEG = 1.5; // merge segments shorter than this into a neighbour
const FALLBACK_WIN = 5; // fixed window length when scene detection finds little

/**
 * Segment a video into scene windows. Runs one ffmpeg pass that prints scene-change
 * scores, turns the cut timestamps into [start,end] windows, and tags each window with
 * a motion proxy (the max scene score inside it, 0..1). Falls back to fixed-length
 * windows when the source has few or no detectable cuts (e.g. a static synthetic clip).
 */
export async function sceneDetect(path: string, durationSec: number): Promise<Window[]> {
  if (!durationSec || durationSec <= 0) return [];
  const cuts = await detectCuts(path);

  // Build boundaries from detected cuts.
  let bounds: number[] = [0, ...cuts.map((c) => c.t), durationSec];
  bounds = dedupeSorted(bounds, durationSec);

  let windows = boundsToWindows(bounds, cuts);
  windows = mergeShort(windows);

  // Fallback: if scene detection produced a single big window, slice fixed windows.
  if (windows.length <= 1 && durationSec > FALLBACK_WIN * 1.5) {
    windows = fixedWindows(durationSec);
  }
  return windows;
}

type Cut = { t: number; score: number };

async function detectCuts(path: string): Promise<Cut[]> {
  // select frames whose scene score exceeds a threshold and print their metadata.
  const { stderr, stdout } = await run(ffmpegPath(), [
    "-hide_banner",
    "-i",
    path,
    "-vf",
    "select='gt(scene,0.3)',metadata=print",
    "-an",
    "-f",
    "null",
    "-",
  ]);
  const text = stderr + "\n" + stdout;
  const cuts: Cut[] = [];
  // metadata=print emits pairs: `pts_time:NN.NN` then `lavfi.scene_score=0.xx`
  const re = /pts_time:([0-9.]+)[\s\S]*?scene_score=([0-9.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    cuts.push({ t: parseFloat(m[1]), score: clamp01(parseFloat(m[2])) });
  }
  return cuts;
}

function boundsToWindows(bounds: number[], cuts: Cut[]): Window[] {
  const out: Window[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const startSec = bounds[i];
    const endSec = bounds[i + 1];
    // motion = max scene score among cuts inside (default a mild baseline)
    const inside = cuts.filter((c) => c.t >= startSec && c.t < endSec).map((c) => c.score);
    const motion = inside.length ? Math.max(...inside) : 0.2;
    out.push({ startSec, endSec, motion: clamp01(motion) });
  }
  return out;
}

function mergeShort(ws: Window[]): Window[] {
  const out: Window[] = [];
  for (const w of ws) {
    const prev = out[out.length - 1];
    if (prev && w.endSec - w.startSec < MIN_SEG) {
      prev.endSec = w.endSec;
      prev.motion = Math.max(prev.motion, w.motion);
    } else {
      out.push({ ...w });
    }
  }
  return out;
}

function fixedWindows(durationSec: number): Window[] {
  const out: Window[] = [];
  for (let t = 0; t < durationSec; t += FALLBACK_WIN) {
    out.push({
      startSec: t,
      endSec: Math.min(t + FALLBACK_WIN, durationSec),
      motion: 0.2,
    });
  }
  return out;
}

function dedupeSorted(xs: number[], max: number): number[] {
  const s = [...new Set(xs.map((x) => Math.max(0, Math.min(max, Math.round(x * 1000) / 1000))))];
  s.sort((a, b) => a - b);
  return s;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
