import type { EdlCaption } from "../schema/edl.js";

/**
 * Captions are burned via libass (the bundled ffmpeg-static has `ass`/`subtitles` but NOT
 * `drawtext`). This builds an ASS file for ONE clip with clip-relative timings; the
 * compiler applies it with the `subtitles` filter. Pure (returns the file content).
 */
export function buildAss(captions: EdlCaption[], w: number, h: number, fontName = "Liberation Sans"): string {
  const fontsize = Math.max(20, Math.round(h * 0.045));
  const marginV = Math.round(h * 0.08);
  const styles = [
    // BorderStyle 3 = opaque box (BackColour); alpha 64 ≈ 60% opaque black.
    `Style: Lower,${fontName},${fontsize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,3,0,0,2,40,40,${marginV},1`,
    `Style: Center,${fontName},${fontsize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,3,0,0,5,40,40,0,1`,
  ];
  const events = captions.map((c) => {
    const style = c.style === "centered" ? "Center" : "Lower";
    return `Dialogue: 0,${toAssTime(c.startSec)},${toAssTime(c.endSec)},${style},,0,0,0,,${assText(c.text)}`;
  });
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function toAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const cs = Math.round((rest - Math.floor(rest)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(Math.floor(rest)).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function assText(t: string): string {
  // ASS escapes: braces start override blocks; newlines are \N; trim hard line breaks.
  return t.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N").trim();
}
