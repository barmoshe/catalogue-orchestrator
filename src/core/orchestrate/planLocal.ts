import { makeTarget, type EDL, type EdlClip, type EdlCaption } from "../schema/edl";
import type { Intent } from "../schema/intent";
import type { ScoredSegment } from "../index/store";
import { hashString } from "../util/hash";
import type { CatalogueLookup } from "./validate";

const STILL_SEC = 2.5; // how long a still image holds in a cut

/**
 * Deterministic heuristic planner — the `local` orchestrator tier. Turns retrieved
 * candidates + intent into a valid EDL with no model call:
 *  - highlights: take the most salient self-contained moments, order by salience;
 *  - assembly: take the best-matching segments, order by retrieval score;
 * trims each clip to a fair share of the duration cap, stops at the cap, and lifts a
 * caption from the transcript when present. Output always passes validateEdl.
 */
export function planLocal(candidates: ScoredSegment[], intent: Intent, lookup: CatalogueLookup): EDL {
  const mode = intent.mode;
  // refine: a feedback string deterministically rotates the candidate order so a
  // regenerate visibly changes the cut (no randomness — keeps it reproducible).
  let ranked = [...candidates];
  if (mode === "highlights") ranked.sort((a, b) => b.segment.salience - a.segment.salience);
  if (intent.feedback) {
    const rot = parseInt(hashString(intent.feedback).slice(0, 4), 16) % Math.max(1, ranked.length);
    ranked = [...ranked.slice(rot), ...ranked.slice(0, rot)];
  }

  const maxDur = intent.maxDurationSec;
  const maxClips = mode === "highlights" ? 6 : 8;
  const perClip = clamp(maxDur / Math.min(maxClips, Math.max(3, ranked.length || 3)), 1.2, 6);

  const clips: EdlClip[] = [];
  let total = 0;
  for (const cand of ranked) {
    if (clips.length >= maxClips || total >= maxDur) break;
    const seg = cand.segment;
    const asset = lookup.asset(seg.assetId);
    const assetDur = asset?.durationSec ?? null;
    const isStill = assetDur === null;

    // Clamp LAST: keep sourceIn inside the asset, then clamp sourceOut to the asset
    // duration. A segment with no usable >=0.3s window is skipped (never stretched past
    // the asset, which would fail validateEdl and break the whole render).
    const sourceIn = isStill ? 0 : Math.max(0, Math.min(seg.startSec, (assetDur ?? 0) - 0.3));
    const sourceOut = isStill ? STILL_SEC : Math.min(seg.endSec, sourceIn + perClip, assetDur ?? Infinity);
    if (!isStill && sourceOut - sourceIn < 0.3) continue;
    const clipDur = sourceOut - sourceIn;
    if (total + clipDur > maxDur + 0.5 && clips.length > 0) break;

    const captions: EdlCaption[] = seg.transcript
      ? [{ text: truncate(seg.transcript, 90), startSec: 0, endSec: Math.max(1, clipDur - 0.2), style: "lower-third" }]
      : [];

    clips.push({
      segmentId: seg.id,
      sourceIn,
      sourceOut,
      layout: "fit",
      transitionIn: clips.length === 0 ? "cut" : "crossfade",
      transitionDurSec: clips.length === 0 ? 0 : 0.25,
      captions,
      speedMultiplier: 1,
    });
    total += clipDur;
  }

  // music: only if asked and an audio asset exists
  let music: EDL["music"] = null;
  if (intent.wantMusic) {
    const audio = lookup.firstAudioAssetId?.();
    if (audio) music = { assetId: audio, gainDb: -14, duckUnderSpeech: true };
  }

  return {
    title: titleFor(intent),
    mode,
    target: makeTarget(intent.aspect, { fps: intent.fps, maxDurationSec: maxDur }),
    music,
    clips: clips.length ? clips : [fallbackClip(ranked, lookup)],
    rationale:
      mode === "highlights"
        ? `Selected the ${clips.length} most salient moments${intent.feedback ? ` (revised: ${truncate(intent.feedback, 40)})` : ""}, ordered by highlight score, each trimmed to ~${perClip.toFixed(1)}s.`
        : `Assembled ${clips.length} segments most relevant to "${truncate(intent.query, 50)}" by retrieval rank${intent.feedback ? ` (revised: ${truncate(intent.feedback, 40)})` : ""}.`,
  };
}

function fallbackClip(ranked: ScoredSegment[], lookup: CatalogueLookup): EdlClip {
  const seg = ranked[0]?.segment;
  if (!seg) throw new Error("planLocal: no candidates to build an EDL from");
  const dur = lookup.asset(seg.assetId)?.durationSec ?? null;
  const sourceIn = dur === null ? 0 : Math.max(0, Math.min(seg.startSec, dur - 0.3));
  const sourceOut = dur === null ? STILL_SEC : Math.min(Math.max(seg.endSec, sourceIn + 0.6), dur);
  return { segmentId: seg.id, sourceIn, sourceOut, layout: "fit", transitionIn: "cut", transitionDurSec: 0, captions: [], speedMultiplier: 1 };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function titleFor(intent: Intent): string {
  const q = intent.query.trim();
  if (intent.mode === "highlights") return q ? `Highlights — ${truncate(q, 40)}` : "Highlights";
  return q ? truncate(q, 50) : "Assembled reel";
}
