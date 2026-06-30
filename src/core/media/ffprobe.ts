import { ffprobePath } from "./ffmpegPath";
import { runOrThrow } from "./spawn";
import type { AssetKind } from "../schema/cards";

export type ProbeResult = {
  kind: AssetKind;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasAudio: boolean;
  codec: string | null;
};

type FfStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  duration?: string;
};
type FfFormat = { duration?: string; format_name?: string };

/** Probe a media file for the technical facts that drive ingest + the compiler. */
export async function probe(path: string): Promise<ProbeResult> {
  const { stdout } = await runOrThrow(ffprobePath(), [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  const json = JSON.parse(stdout) as { streams?: FfStream[]; format?: FfFormat };
  const streams = json.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  const durationSec = num(json.format?.duration) ?? num(video?.duration) ?? num(audio?.duration);
  const hasAudio = Boolean(audio);
  const hasVideo = Boolean(video);

  // An image is a single-frame video stream with no/negligible duration.
  const isImage =
    hasVideo && !audio && (durationSec === null || durationSec <= 0.05) && isImageCodec(video?.codec_name);

  const kind: AssetKind = isImage ? "image" : hasVideo ? "video" : "audio";

  return {
    kind,
    durationSec: kind === "image" ? null : durationSec,
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: kind === "image" ? null : parseFps(video?.r_frame_rate),
    hasAudio,
    codec: (video?.codec_name ?? audio?.codec_name) ?? null,
  };
}

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function parseFps(r: string | undefined): number | null {
  if (!r) return null;
  const [a, b] = r.split("/").map(Number);
  if (!b) return Number.isFinite(a) ? a : null;
  const fps = a / b;
  return Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : null;
}

function isImageCodec(codec: string | undefined): boolean {
  if (!codec) return false;
  return ["mjpeg", "png", "bmp", "gif", "webp", "tiff"].includes(codec);
}
