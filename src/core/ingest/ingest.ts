import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { existsSync } from "node:fs";
import { hashFile } from "../util/hash";
import { probe } from "../media/ffprobe";
import { sceneDetect, type Window } from "./sceneDetect";
import { sampleFrames, sampleOne } from "./sampleFrames";
import { measureAudioEnergy, deriveSegmentSignals } from "./deriveSignals";
import { hasEntry, readEntry, writeEntry, keyframeDir, type StoredEntry } from "./persist";
import { getProviders } from "../providers/index";
import type { Providers, TranscriptSegment } from "../providers/types";
import type { AssetCard, SegmentCard } from "../schema/cards";

const MEDIA_EXT = new Set([
  ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", // video
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", // image
  ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", // audio
]);

export type IngestEvent =
  | { type: "asset-start"; path: string }
  | { type: "asset-cache-hit"; path: string; id: string }
  | { type: "asset-done"; path: string; id: string; segments: number }
  | { type: "asset-error"; path: string; error: string };

export type IngestOptions = {
  env?: NodeJS.ProcessEnv;
  providers?: Providers;
  onEvent?: (e: IngestEvent) => void;
  /** Re-ingest even when a card already exists. */
  force?: boolean;
};

/** Ingest every supported media file in a folder into catalogue cards. */
export async function ingestDir(dir: string, opts: IngestOptions = {}): Promise<StoredEntry[]> {
  const files = await listMedia(dir);
  const out: StoredEntry[] = [];
  for (const file of files) {
    const entry = await ingestFile(file, opts);
    if (entry) out.push(entry);
  }
  return out;
}

/** Ingest one media file -> Asset + Segment cards, persisted. Idempotent by content hash. */
export async function ingestFile(path: string, opts: IngestOptions = {}): Promise<StoredEntry | null> {
  const env = opts.env ?? process.env;
  const providers = opts.providers ?? getProviders(env);
  const emit = opts.onEvent ?? (() => {});
  emit({ type: "asset-start", path });

  try {
    const id = await hashFile(path);
    if (!opts.force && hasEntry(id, env)) {
      emit({ type: "asset-cache-hit", path, id });
      return await readEntry(id, env);
    }

    const tech = await probe(path);
    const kfDir = keyframeDir(env);

    // 1) windows (the retrieval units)
    const windows: Window[] =
      tech.kind === "video" && tech.durationSec
        ? await sceneDetect(path, tech.durationSec)
        : [{ startSec: 0, endSec: tech.durationSec ?? 0, motion: 0.2 }];

    // 2) transcript (real Whisper when keyed; local tier returns empty)
    let transcript: TranscriptSegment[] = [];
    if (tech.hasAudio || tech.kind === "audio") {
      const tr = await providers.transcription.transcribe(path).catch(() => null);
      if (tr) transcript = tr.segments;
    }

    // 3) audio energy (whole-asset)
    const audioEnergy = await measureAudioEnergy(path, tech.hasAudio || tech.kind === "audio");

    // 4) keyframes (video: one per window; image: one; audio: none)
    const keyframes =
      tech.kind === "video"
        ? await sampleFrames(path, id, windows, kfDir)
        : tech.kind === "image"
          ? [await sampleOne(path, id, kfDir)]
          : windows.map(() => null);

    // 5) per-window segment cards (caption + signals + embedding text)
    const segments: SegmentCard[] = [];
    for (let i = 0; i < windows.length; i += 1) {
      const w = windows[i];
      const kf = keyframes[i] ?? null;
      const winText = windowTranscript(transcript, w.startSec, w.endSec);
      const caption = kf
        ? await providers.vision
            .caption(kf, { context: `${basename(path)} (${fmt(w.startSec)}-${fmt(w.endSec)})` })
            .catch(() => null)
        : null;
      const sig = deriveSegmentSignals(w, audioEnergy, transcript);
      const tags = deriveTags(tech, sig);
      const embeddingText = [caption, winText, tags.join(" ")].filter(Boolean).join(" ").trim();
      segments.push({
        id: `${id}:${i}`,
        assetId: id,
        index: i,
        startSec: w.startSec,
        endSec: w.endSec,
        transcript: winText || null,
        caption: caption ?? null,
        keyframePath: kf,
        tags,
        ...sig,
        embeddingText: embeddingText || basename(path),
      });
    }

    // 6) asset card
    const asset: AssetCard = {
      id,
      path,
      kind: tech.kind,
      durationSec: tech.durationSec,
      width: tech.width,
      height: tech.height,
      fps: tech.fps,
      hasAudio: tech.hasAudio,
      codec: tech.codec,
      summary: assetSummary(path, tech, segments),
      tags: dedupe(segments.flatMap((s) => s.tags)),
      dominantColors: [],
      segmentIds: segments.map((s) => s.id),
      ingestedAt: new Date().toISOString(),
    };

    const entry: StoredEntry = { asset, segments };
    await writeEntry(entry, env);
    emit({ type: "asset-done", path, id, segments: segments.length });
    return entry;
  } catch (err) {
    emit({ type: "asset-error", path, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function listMedia(dir: string): Promise<string[]> {
  if (!existsSync(dir)) throw new Error(`catalogue dir not found: ${dir}`);
  const ents = await readdir(dir);
  const out: string[] = [];
  for (const name of ents) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = await stat(full);
    if (st.isFile() && MEDIA_EXT.has(extname(name).toLowerCase())) out.push(full);
  }
  return out.sort();
}

function windowTranscript(segs: TranscriptSegment[], a: number, b: number): string {
  return segs
    .filter((s) => s.end > a && s.start < b)
    .map((s) => s.text)
    .join(" ")
    .trim();
}

function deriveTags(tech: { kind: string; hasAudio: boolean }, sig: { motion: number; speechRatio: number; audioEnergy: number }): string[] {
  const tags: string[] = [tech.kind];
  if (sig.speechRatio > 0.25) tags.push("speech");
  if (sig.motion > 0.45) tags.push("high-motion");
  else if (sig.motion < 0.15) tags.push("static");
  if (sig.audioEnergy > 0.5) tags.push("loud");
  if (!tech.hasAudio && tech.kind !== "image") tags.push("silent");
  return tags;
}

function assetSummary(path: string, tech: { kind: string; durationSec: number | null }, segs: SegmentCard[]): string {
  const dur = tech.durationSec ? `${tech.durationSec.toFixed(1)}s` : "still";
  const caps = segs.map((s) => s.caption).filter(Boolean).slice(0, 2).join("; ");
  return `${tech.kind} ${dur} (${segs.length} segment${segs.length === 1 ? "" : "s"}) — ${basename(path)}${caps ? `. ${caps}` : ""}`;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
function fmt(n: number): string {
  return n.toFixed(1);
}
