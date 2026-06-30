import type { SegmentCard } from "../schema/cards.js";

/** Cheap, exact pre-filters so retrieval returns candidates that are USABLE in the cut. */
export type StructuredFilter = {
  kind?: Array<"video" | "image" | "audio">;
  /** require speech (speechRatio above a threshold) — e.g. for a talking-head clip */
  hasSpeech?: boolean;
  minDurationSec?: number;
  maxDurationSec?: number;
  minSalience?: number;
  /** restrict to one source asset (Mode A: highlights of one recording) */
  assetId?: string;
};

export type ScoredSegment = { segment: SegmentCard; score: number };

/**
 * The retrieval index, behind one interface so the impl is swappable. Default is the
 * dependency-free LocalVectorStore (brute-force cosine + keyword over persisted vectors);
 * LanceDB / sqlite-vec are drop-in alternatives that implement the same contract when the
 * catalogue outgrows local. (See ADR: local store first.)
 */
export interface VectorStore {
  upsert(items: Array<{ segment: SegmentCard; vector: number[] }>): Promise<void>;
  search(queryVec: number[], filter: StructuredFilter, k: number): Promise<ScoredSegment[]>;
  keyword(text: string, filter: StructuredFilter, k: number): Promise<ScoredSegment[]>;
  all(): Promise<SegmentCard[]>;
  size(): Promise<number>;
}

/** A segment passes a structured filter when every present constraint holds. */
export function passesFilter(s: SegmentCard, f: StructuredFilter): boolean {
  const dur = s.endSec - s.startSec;
  if (f.assetId && s.assetId !== f.assetId) return false;
  if (f.hasSpeech && s.speechRatio < 0.25) return false;
  if (f.minDurationSec !== undefined && dur < f.minDurationSec) return false;
  if (f.maxDurationSec !== undefined && dur > f.maxDurationSec) return false;
  if (f.minSalience !== undefined && s.salience < f.minSalience) return false;
  // kind lives on the asset, not the segment; callers that need a kind filter resolve it
  // by passing assetId or pre-filtering. Kept here for interface completeness.
  return true;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Reciprocal-rank fusion: merge ranked lists into one, robust to differing score scales.
 * score(item) = Σ 1/(c + rank). Dedupes by segment id, keeps the SegmentCard.
 */
export function reciprocalRankFusion(lists: ScoredSegment[][], k: number, c = 60): ScoredSegment[] {
  const acc = new Map<string, { segment: SegmentCard; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const cur = acc.get(item.segment.id);
      const add = 1 / (c + rank);
      if (cur) cur.score += add;
      else acc.set(item.segment.id, { segment: item.segment, score: add });
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
