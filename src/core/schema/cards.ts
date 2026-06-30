import { z } from "zod";

/**
 * Catalogue "cards" — the structured, machine-readable units that RAG ranks and the
 * orchestrator consumes. One source of truth; reused for persistence, retrieval, and
 * provider I/O. See DESIGN.md §3.
 */

export const AssetKind = z.enum(["video", "image", "audio"]);
export type AssetKind = z.infer<typeof AssetKind>;

export const ShotType = z.enum(["wide", "medium", "close", "unknown"]);
export type ShotType = z.infer<typeof ShotType>;

/** One per source file. Content hash is the cache key. */
export const AssetCard = z.object({
  id: z.string(), // sha256 of bytes (content hash) — the cache key
  path: z.string(), // local source path
  kind: AssetKind,
  // technical (from ffprobe)
  durationSec: z.number().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  fps: z.number().nullable(),
  hasAudio: z.boolean(),
  codec: z.string().nullable(),
  // derived (whole-asset)
  summary: z.string(), // one-paragraph description
  tags: z.array(z.string()),
  dominantColors: z.array(z.string()), // hex
  // children
  segmentIds: z.array(z.string()),
  ingestedAt: z.string(), // ISO
});
export type AssetCard = z.infer<typeof AssetCard>;

/** The retrieval unit — one per scene / transcript window. */
export const SegmentCard = z.object({
  id: z.string(), // `${assetId}:${index}`
  assetId: z.string(),
  index: z.number().int(),
  startSec: z.number(),
  endSec: z.number(),
  // content
  transcript: z.string().nullable(),
  caption: z.string().nullable(),
  keyframePath: z.string().nullable(),
  tags: z.array(z.string()),
  // signals that gate usability in a cut (0..1 unless noted)
  shotType: ShotType,
  motion: z.number(),
  audioEnergy: z.number(),
  speechRatio: z.number(),
  salience: z.number(), // "highlight-worthiness" (Mode A pre-score)
  // RAG
  embeddingText: z.string(), // caption + transcript + tags
});
export type SegmentCard = z.infer<typeof SegmentCard>;

/** Convenience bundle persisted/consumed together. */
export const Catalogue = z.object({
  assets: z.array(AssetCard),
  segments: z.array(SegmentCard),
});
export type Catalogue = z.infer<typeof Catalogue>;
