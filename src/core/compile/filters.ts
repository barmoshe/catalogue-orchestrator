import type { Layout } from "../schema/edl";

/**
 * Aspect-fit filtergraphs (DESIGN §7 / AGENTS rule 4) — scale + pad/crop, never stretch:
 *   fit     = contain (decrease + pad)         — whole frame visible, letterboxed
 *   fill    = cover (increase + crop)          — fills the frame, edges cropped
 *   blurpad = contained foreground over a blurred cover background
 * All end with setsar=1 and a constant fps so segments concat cleanly.
 */
export function videoFitChain(input: string, layout: Layout, w: number, h: number, fps: number, out: string): string {
  if (layout === "fill") {
    return `[${input}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${fps}[${out}]`;
  }
  if (layout === "blurpad") {
    return (
      `[${input}]split=2[bg_${out}][fg_${out}];` +
      `[bg_${out}]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=18[bgb_${out}];` +
      `[fg_${out}]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs_${out}];` +
      `[bgb_${out}][fgs_${out}]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps}[${out}]`
    );
  }
  // fit (default)
  return `[${input}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}[${out}]`;
}

/** Escape a path for use inside an ffmpeg filtergraph option value. */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/**
 * Apply burned captions to a labelled stream via libass (`subtitles` filter reading a
 * generated ASS file) — the bundled ffmpeg has libass but not drawtext. `fontsDir` lets
 * libass find the bundled font by family name. No ASS file → a passthrough.
 */
export function subtitlesChain(inLabel: string, assPath: string | null, fontsDir: string, outLabel: string): string {
  if (!assPath) return `[${inLabel}]null[${outLabel}]`;
  return `[${inLabel}]subtitles=filename='${escapeFilterPath(assPath)}':fontsdir='${escapeFilterPath(fontsDir)}'[${outLabel}]`;
}
