import type { EDL, EdlClip } from "../schema/edl";
import { videoFitChain, subtitlesChain } from "./filters";

export type ResolvedClip = {
  clip: EdlClip;
  path: string;
  kind: "video" | "image" | "audio";
  hasAudio: boolean;
};

export type CompileInputs = {
  edl: EDL;
  clips: ResolvedClip[];
  music: { path: string; gainDb: number; duckUnderSpeech: boolean } | null;
  /** per-clip ASS subtitle file path (null = no captions) + the dir holding the bundled font */
  clipAssPath: (i: number) => string | null;
  fontsDir: string;
  /** absolute paths the run layer provides */
  segFile: (i: number) => string;
  concatListPath: string;
  preMusicFile: string;
  outFile: string;
};

export type FfmpegJob = { name: string; args: string[]; outFile: string };
export type CompilePlan = {
  segmentJobs: FfmpegJob[];
  segmentFiles: string[];
  concatJob: FfmpegJob;
  mixJob: FfmpegJob | null;
  finalFile: string;
};

const VENC = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
const AENC = ["-c:a", "aac", "-ar", "48000", "-ac", "2"];

/**
 * PURE: EDL + resolved clips → ffmpeg job arg-arrays + a temp plan. No fs, no spawn — so
 * it is fully unit-testable (DESIGN §7). Strategy: normalize each clip to an identical
 * target-spec MP4 (aspect-fit + burned captions + a guaranteed audio track), then concat,
 * then optionally mix a music bed. The compiler owns 100% of ffmpeg; the model never does.
 */
export function edlToFfmpeg(inp: CompileInputs): CompilePlan {
  const { width: W, height: H, fps } = inp.edl.target;
  const segmentJobs: FfmpegJob[] = [];
  const segmentFiles: string[] = [];

  inp.clips.forEach((rc, i) => {
    const out = inp.segFile(i);
    segmentFiles.push(out);
    segmentJobs.push(clipJob(rc, i, W, H, fps, inp.clipAssPath(i), inp.fontsDir, out));
  });

  const concatTarget = inp.music ? inp.preMusicFile : inp.outFile;
  const concatJob: FfmpegJob = {
    name: "concat",
    args: ["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", inp.concatListPath, "-c", "copy", concatTarget],
    outFile: concatTarget,
  };

  let mixJob: FfmpegJob | null = null;
  if (inp.music) {
    mixJob = {
      name: "mix",
      args: [
        "-hide_banner", "-y",
        "-i", inp.preMusicFile,
        "-stream_loop", "-1", "-i", inp.music.path,
        "-filter_complex", musicMixFilter(inp.music.gainDb, inp.music.duckUnderSpeech),
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy", ...AENC,
        "-shortest",
        inp.outFile,
      ],
      outFile: inp.outFile,
    };
  }

  return { segmentJobs, segmentFiles, concatJob, mixJob, finalFile: inp.outFile };
}

function clipJob(rc: ResolvedClip, i: number, W: number, H: number, fps: number, assPath: string | null, fontsDir: string, out: string): FfmpegJob {
  const { clip } = rc;
  const dur = Math.max(0.1, +(clip.sourceOut - clip.sourceIn).toFixed(3));
  const inputs: string[] = [];
  let audioMap = "";
  let needSilent = false;

  if (rc.kind === "video") {
    inputs.push("-ss", String(clip.sourceIn), "-t", String(dur), "-i", rc.path);
    if (rc.hasAudio) audioMap = "0:a"; else needSilent = true;
  } else if (rc.kind === "image") {
    inputs.push("-loop", "1", "-t", String(dur), "-i", rc.path);
    needSilent = true;
  } else {
    // audio-only: a solid background video + the segment's audio
    inputs.push("-f", "lavfi", "-t", String(dur), "-i", `color=c=0x12161f:s=${W}x${H}:r=${fps}`);
    inputs.push("-ss", String(clip.sourceIn), "-t", String(dur), "-i", rc.path);
    audioMap = "1:a";
  }
  if (needSilent) {
    inputs.push("-f", "lavfi", "-t", String(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    audioMap = "1:a"; // the silent source is always the 2nd input in the silent cases
  }

  const vchain = videoFitChain("0:v", clip.layout, W, H, fps, "vf");
  const cchain = subtitlesChain("vf", clip.captions.length ? assPath : null, fontsDir, "vout");
  const filter = `${vchain};${cchain}`;

  const args = [
    "-hide_banner", "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "[vout]", "-map", audioMap,
    ...VENC, ...AENC,
    "-r", String(fps), "-t", String(dur),
    out,
  ];
  return { name: `seg_${i}`, args, outFile: out };
}

function musicMixFilter(gainDb: number, duck: boolean): string {
  if (duck) {
    // music ducks under the program audio (sidechain by the concatenated track)
    return (
      `[1:a]volume=${gainDb}dB[mv];` +
      `[mv][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[mduck];` +
      `[0:a][mduck]amix=inputs=2:duration=first:normalize=0[aout]`
    );
  }
  return `[1:a]volume=${gainDb}dB[mv];[0:a][mv]amix=inputs=2:duration=first:normalize=0[aout]`;
}
