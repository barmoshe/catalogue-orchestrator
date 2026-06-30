import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, isAbsolute, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { EDL } from "../schema/edl.js";
import { loadCatalogue } from "../ingest/persist.js";
import { makeLookup, validateEdl } from "../orchestrate/validate.js";
import { edlToFfmpeg, type ResolvedClip } from "./edlToFfmpeg.js";
import { executePlan, type RenderProgress, type RunResultInfo } from "./run.js";
import { resolveFont } from "./font.js";
import { buildAss } from "./captions.js";

export function runtimeDir(env: NodeJS.ProcessEnv = process.env): string {
  const d = env.RUNTIME_DIR || "runtime";
  return isAbsolute(d) ? d : resolve(process.cwd(), d);
}

export type CompileOptions = {
  env?: NodeJS.ProcessEnv;
  jobId?: string;
  outFile?: string;
  keepTemp?: boolean;
  onProgress?: (p: RenderProgress) => void;
};

/**
 * Auto-cut: a validated EDL → a finished MP4. Resolves clip/music asset paths + a caption
 * font, builds the pure plan, writes the concat list, runs it behind the render lock, and
 * ffprobe-verifies the output. Captions are skipped (not fatal) when no font is available.
 */
export async function compileEdl(edlInput: unknown, opts: CompileOptions = {}): Promise<RunResultInfo> {
  const env = opts.env ?? process.env;
  const edl = EDL.parse(edlInput);
  const cat = await loadCatalogue(env);
  const lookup = makeLookup(cat);

  const v = validateEdl(edl, lookup);
  if (!v.ok) throw new Error(`compileEdl: invalid EDL: ${v.error}`);

  const font = resolveFont(env);
  const clips: ResolvedClip[] = edl.clips.map((clip) => {
    const seg = lookup.segment(clip.segmentId)!;
    const asset = lookup.asset(seg.assetId)!;
    return {
      clip: { ...clip, captions: font ? clip.captions : [] },
      path: asset.path,
      kind: asset.kind,
      hasAudio: asset.hasAudio,
    };
  });

  let music: { path: string; gainDb: number; duckUnderSpeech: boolean } | null = null;
  if (edl.music) {
    const m = lookup.asset(edl.music.assetId);
    if (m) music = { path: m.path, gainDb: edl.music.gainDb, duckUnderSpeech: edl.music.duckUnderSpeech };
  }

  const jobId = opts.jobId ?? randomUUID();
  const baseDir = join(runtimeDir(env), "renders", jobId);
  const sourcesDir = join(baseDir, "sources");
  const captionsDir = join(baseDir, "captions");
  await mkdir(sourcesDir, { recursive: true });

  // Write a per-clip ASS file for any clip that carries captions (libass burns them).
  const fontsDir = font ? dirname(font) : "";
  const assPaths: Array<string | null> = [];
  if (font) await mkdir(captionsDir, { recursive: true });
  for (let i = 0; i < clips.length; i += 1) {
    const caps = clips[i].clip.captions;
    if (font && caps.length > 0) {
      const p = join(captionsDir, `clip_${i}.ass`);
      await writeFile(p, buildAss(caps, edl.target.width, edl.target.height), "utf8");
      assPaths.push(p);
    } else {
      assPaths.push(null);
    }
  }

  const segFile = (i: number) => join(sourcesDir, `seg_${i}.mp4`);
  const concatListPath = join(baseDir, "concat.txt");
  const preMusicFile = join(baseDir, "concat.mp4");
  const outFile = opts.outFile ?? join(baseDir, "out.mp4");

  const plan = edlToFfmpeg({ edl, clips, music, clipAssPath: (i) => assPaths[i], fontsDir, segFile, concatListPath, preMusicFile, outFile });

  const list = plan.segmentFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
  await writeFile(concatListPath, list, "utf8");

  const totalDur = edl.clips.reduce((n, c) => n + (c.sourceOut - c.sourceIn), 0);
  const info = await executePlan(plan, { totalDurationSec: totalDur, onProgress: opts.onProgress });

  if (opts.keepTemp !== true) {
    await rm(sourcesDir, { recursive: true, force: true }).catch(() => {});
    await rm(captionsDir, { recursive: true, force: true }).catch(() => {});
    await rm(concatListPath, { force: true }).catch(() => {});
    if (music) await rm(preMusicFile, { force: true }).catch(() => {});
  }
  return info;
}
