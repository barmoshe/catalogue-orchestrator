import { z } from "zod";

/**
 * The Edit Decision List — the ONLY structured artifact the AI produces, and the ONLY
 * input the compiler consumes. Validated with zod on the way out of the model AND on
 * the way into the compiler. See DESIGN.md §3.3 and AGENTS.md rule 1.
 */

export const Aspect = z.enum(["9:16", "1:1", "16:9"]);
export type Aspect = z.infer<typeof Aspect>;

export const Layout = z.enum(["fill", "fit", "blurpad"]);
export type Layout = z.infer<typeof Layout>;

export const Transition = z.enum(["cut", "fade", "crossfade"]);
export type Transition = z.infer<typeof Transition>;

export const CaptionStyle = z.enum(["lower-third", "centered", "word-by-word"]);
export type CaptionStyle = z.infer<typeof CaptionStyle>;

export const EdlCaption = z.object({
  text: z.string(),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  style: CaptionStyle.optional().default("lower-third"),
});
export type EdlCaption = z.infer<typeof EdlCaption>;

export const EdlClip = z.object({
  segmentId: z.string(), // must exist in the catalogue
  sourceIn: z.number().min(0), // trim within the source asset (sec)
  sourceOut: z.number().min(0),
  layout: Layout.default("fit"),
  transitionIn: Transition.optional().default("cut"),
  transitionDurSec: z.number().min(0).optional().default(0),
  captions: z.array(EdlCaption).optional().default([]),
  speedMultiplier: z.number().positive().optional().default(1),
});
export type EdlClip = z.infer<typeof EdlClip>;

export const EdlTarget = z.object({
  aspect: Aspect,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  maxDurationSec: z.number().positive(),
});
export type EdlTarget = z.infer<typeof EdlTarget>;

export const EdlMusic = z
  .object({
    assetId: z.string(),
    gainDb: z.number().default(-12),
    duckUnderSpeech: z.boolean().default(true),
  })
  .nullable();

export const EDL = z.object({
  title: z.string(),
  mode: z.enum(["highlights", "assembly"]),
  target: EdlTarget,
  music: EdlMusic.optional().default(null),
  clips: z.array(EdlClip).min(1),
  rationale: z.string(), // why these clips/order — shown in the refine UI
});
export type EDL = z.infer<typeof EDL>;

/** Standard target presets so callers don't hand-compute width/height. */
export const ASPECT_PRESETS: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export function makeTarget(
  aspect: Aspect,
  opts?: { fps?: number; maxDurationSec?: number },
): EdlTarget {
  const { width, height } = ASPECT_PRESETS[aspect];
  return {
    aspect,
    width,
    height,
    fps: opts?.fps ?? 30,
    maxDurationSec: opts?.maxDurationSec ?? 60,
  };
}
