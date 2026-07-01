import { describe, it, expect } from "vitest";
import type { AssetCard, SegmentCard, Catalogue } from "../src/core/schema/cards";
import { Intent } from "../src/core/schema/intent";
import { makeLookup, validateEdl } from "../src/core/orchestrate/validate";
import { planLocal } from "../src/core/orchestrate/planLocal";
import { EDL } from "../src/core/schema/edl";
import type { ScoredSegment } from "../src/core/index/store";

function asset(id: string, dur: number | null, kind: AssetCard["kind"] = "video"): AssetCard {
  return { id, path: `${id}.mp4`, kind, durationSec: dur, width: 640, height: 360, fps: 30, hasAudio: true, codec: "h264", summary: "", tags: [], dominantColors: [], segmentIds: [], ingestedAt: "2026-01-01T00:00:00Z" };
}
function seg(assetId: string, i: number, start: number, end: number, over: Partial<SegmentCard> = {}): SegmentCard {
  return { id: `${assetId}:${i}`, assetId, index: i, startSec: start, endSec: end, transcript: null, caption: `c${i}`, keyframePath: null, tags: ["video"], shotType: "unknown", motion: 0.3, audioEnergy: 0.3, speechRatio: 0, salience: 0.4, embeddingText: `c${i}`, ...over };
}

const CAT: Catalogue = {
  assets: [asset("a", 12), asset("m", 30, "audio")],
  segments: [
    seg("a", 0, 0, 4, { salience: 0.9 }),
    seg("a", 1, 4, 8, { salience: 0.6, transcript: "hello world this is a spoken line", speechRatio: 0.8 }),
    seg("a", 2, 8, 12, { salience: 0.3 }),
  ],
};
const lookup = makeLookup(CAT);
const cands: ScoredSegment[] = CAT.segments.map((segment, i) => ({ segment, score: 1 - i * 0.1 }));

describe("planLocal", () => {
  it("produces a schema-valid, catalogue-valid highlights EDL", () => {
    const intent = Intent.parse({ mode: "highlights", query: "best bits", maxDurationSec: 15 });
    const edl = planLocal(cands, intent, lookup);
    expect(EDL.safeParse(edl).success).toBe(true);
    const res = validateEdl(edl, lookup);
    expect(res.ok).toBe(true);
    expect(edl.target.aspect).toBe("9:16");
    // highlights ordered by salience: a:0 (0.9) should come first
    expect(edl.clips[0].segmentId).toBe("a:0");
  });

  it("keeps total duration within the cap", () => {
    const intent = Intent.parse({ mode: "highlights", maxDurationSec: 6 });
    const edl = planLocal(cands, intent, lookup);
    const total = edl.clips.reduce((n, c) => n + (c.sourceOut - c.sourceIn), 0);
    expect(total).toBeLessThanOrEqual(6.5);
  });

  it("lifts a caption from a transcript and keeps sourceOut within the asset", () => {
    const intent = Intent.parse({ mode: "assembly", query: "spoken", maxDurationSec: 20 });
    const edl = planLocal(cands, intent, lookup);
    const res = validateEdl(edl, lookup);
    expect(res.ok).toBe(true);
    for (const clip of edl.clips) expect(clip.sourceOut).toBeLessThanOrEqual(12.05);
  });

  it("regenerate with feedback stays valid and records the revision", () => {
    const b = planLocal(cands, Intent.parse({ mode: "assembly", query: "x", maxDurationSec: 20, feedback: "more energetic, drop the slow bit" }), lookup);
    expect(validateEdl(b, lookup).ok).toBe(true);
    expect(b.rationale).toContain("revised");
  });
});

describe("validateEdl", () => {
  it("rejects a hallucinated segmentId", () => {
    const good = planLocal(cands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), lookup);
    const bad = { ...good, clips: [{ ...good.clips[0], segmentId: "ghost:9" }] };
    const res = validateEdl(bad, lookup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("does not exist");
  });

  it("rejects an out-of-range sourceOut", () => {
    const good = planLocal(cands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), lookup);
    const bad = { ...good, clips: [{ ...good.clips[0], sourceIn: 0, sourceOut: 999 }] };
    const res = validateEdl(bad, lookup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("exceeds asset duration");
  });

  it("rejects a caption whose endSec exceeds its clip's own duration", () => {
    const good = planLocal(cands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), lookup);
    const clip0 = good.clips[0];
    const clipDur = clip0.sourceOut - clip0.sourceIn;
    const bad = { ...good, clips: [{ ...clip0, captions: [{ text: "x", startSec: 0, endSec: clipDur + 5, style: "lower-third" as const }] }] };
    const res = validateEdl(bad, lookup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("exceeds the clip's own duration");
  });

  it("rejects a music assetId that is not an audio asset", () => {
    const good = planLocal(cands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), lookup);
    const bad = { ...good, music: { assetId: "a", gainDb: -12, duckUnderSpeech: true } };
    const res = validateEdl(bad, lookup);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("not audio");
  });

  it("accepts a music assetId that IS an audio asset", () => {
    const good = planLocal(cands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), lookup);
    const ok = { ...good, music: { assetId: "m", gainDb: -12, duckUnderSpeech: true } };
    expect(validateEdl(ok, lookup).ok).toBe(true);
  });
});

describe("planLocal (tail-of-asset clamp regression)", () => {
  it("clamps a segment near the end of its asset instead of overflowing sourceOut", () => {
    // asset "a" is 12s; this segment's window runs right up to (and slightly past, via
    // rounding) the asset boundary — the old code could clamp sourceOut but leave
    // sourceIn unclamped-first, or floor a too-short window past the asset end.
    const tailCat: Catalogue = {
      assets: [asset("t", 10)],
      segments: [seg("t", 0, 9.85, 10.5, { salience: 0.9 })],
    };
    const tailLookup = makeLookup(tailCat);
    const tailCands: ScoredSegment[] = tailCat.segments.map((segment) => ({ segment, score: 1 }));
    const edl = planLocal(tailCands, Intent.parse({ mode: "highlights", maxDurationSec: 10 }), tailLookup);
    const res = validateEdl(edl, tailLookup);
    expect(res.ok).toBe(true);
    for (const clip of edl.clips) expect(clip.sourceOut).toBeLessThanOrEqual(10.05);
  });

  it("caption endSec is clamped to the clip's own (short) duration", () => {
    // a very short clip with a transcript: the old `Math.max(1, clipDur-0.2)` could push
    // endSec above clipDur for clips shorter than ~1.2s.
    const shortCat: Catalogue = {
      assets: [asset("s", 5)],
      segments: [seg("s", 0, 0, 0.5, { salience: 0.9, transcript: "hi", speechRatio: 0.9 })],
    };
    const shortLookup = makeLookup(shortCat);
    const shortCands: ScoredSegment[] = shortCat.segments.map((segment) => ({ segment, score: 1 }));
    const edl = planLocal(shortCands, Intent.parse({ mode: "assembly", maxDurationSec: 5 }), shortLookup);
    expect(validateEdl(edl, shortLookup).ok).toBe(true);
    const clip = edl.clips[0];
    if (clip.captions.length) expect(clip.captions[0].endSec).toBeLessThanOrEqual(clip.sourceOut - clip.sourceIn + 0.001);
  });
});
