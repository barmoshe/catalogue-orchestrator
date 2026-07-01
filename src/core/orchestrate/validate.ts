import { EDL } from "../schema/edl";
import type { AssetCard, SegmentCard, Catalogue } from "../schema/cards";

export type CatalogueLookup = {
  asset: (id: string) => AssetCard | undefined;
  segment: (id: string) => SegmentCard | undefined;
  assetOfSegment: (segmentId: string) => AssetCard | undefined;
  firstAudioAssetId: () => string | undefined;
};

export function makeLookup(cat: Catalogue): CatalogueLookup {
  const assets = new Map(cat.assets.map((a) => [a.id, a]));
  const segments = new Map(cat.segments.map((s) => [s.id, s]));
  return {
    asset: (id) => assets.get(id),
    segment: (id) => segments.get(id),
    assetOfSegment: (segmentId) => {
      const s = segments.get(segmentId);
      return s ? assets.get(s.assetId) : undefined;
    },
    firstAudioAssetId: () => cat.assets.find((a) => a.kind === "audio")?.id,
  };
}

export type ValidationResult =
  | { ok: true; edl: EDL }
  | { ok: false; error: string };

/**
 * Validate model/heuristic output BEFORE the compiler ever sees it (AGENTS rule 1):
 *   1. zod-parse against the EDL schema;
 *   2. every clip.segmentId must exist in the catalogue;
 *   3. every sourceIn/sourceOut must be in range for that segment's source asset.
 * On failure, returns a precise message the caller can re-prompt the model with.
 */
export function validateEdl(raw: unknown, lookup: CatalogueLookup): ValidationResult {
  const parsed = EDL.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` };
  }
  const edl = parsed.data;
  for (let i = 0; i < edl.clips.length; i += 1) {
    const clip = edl.clips[i];
    const seg = lookup.segment(clip.segmentId);
    if (!seg) return { ok: false, error: `clips[${i}].segmentId "${clip.segmentId}" does not exist in the catalogue` };
    const asset = lookup.asset(seg.assetId);
    if (!asset) return { ok: false, error: `clips[${i}]: asset for segment "${clip.segmentId}" is missing` };
    if (clip.sourceOut <= clip.sourceIn) {
      return { ok: false, error: `clips[${i}]: sourceOut (${clip.sourceOut}) must be greater than sourceIn (${clip.sourceIn})` };
    }
    // images have null duration (still frame) — any short range is acceptable.
    const dur = asset.durationSec;
    if (dur !== null && clip.sourceIn >= dur) {
      return { ok: false, error: `clips[${i}]: sourceIn (${clip.sourceIn}) is beyond asset duration (${dur})` };
    }
    if (dur !== null && clip.sourceOut > dur + 0.05) {
      return { ok: false, error: `clips[${i}]: sourceOut (${clip.sourceOut}) exceeds asset duration (${dur})` };
    }
    const clipDur = clip.sourceOut - clip.sourceIn;
    for (let c = 0; c < clip.captions.length; c += 1) {
      const cap = clip.captions[c];
      if (cap.endSec > clipDur + 0.05) {
        return { ok: false, error: `clips[${i}].captions[${c}]: endSec (${cap.endSec}) exceeds the clip's own duration (${clipDur.toFixed(2)})` };
      }
    }
  }
  if (edl.music) {
    const m = lookup.asset(edl.music.assetId);
    if (!m) return { ok: false, error: `music.assetId "${edl.music.assetId}" does not exist in the catalogue` };
    if (m.kind !== "audio") return { ok: false, error: `music.assetId "${edl.music.assetId}" is a ${m.kind} asset, not audio` };
  }
  return { ok: true, edl };
}
