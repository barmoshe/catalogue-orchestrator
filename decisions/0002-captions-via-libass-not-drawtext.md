# 0002 — Captions burn via libass/ASS, not ffmpeg `drawtext`

Date: 2026-07-01
Status: Accepted
Supersedes: an earlier PNG-overlay plan considered mid-build (see below)

## Context

DESIGN.md and the initial workshop pointer assumed captions would render via ffmpeg's
`drawtext` filter. Verifying against the actually-installed binaries (the `media-pipeline`
skill's "verify, don't assume" spine):

- The **system ffmpeg** on the build machine (8.1) was compiled *without* `libfreetype`,
  so it has no `drawtext` filter at all.
- The **bundled `ffmpeg-static`** package (6.1.1, "tessus" build) *does* have libfreetype
  — but on inspection its filter list has `ass`/`subtitles` (libass) and *not* `drawtext`.

Both paths lack `drawtext`. A mid-build plan to render captions as transparent PNG
overlays composited with the `overlay` filter (build-independent, since `overlay` is
present everywhere) was drafted as the fallback — but once it was confirmed the bundled
binary reliably ships libass, the simpler, more capable path is to use it directly.

## Decision

Captions burn via **libass**: `src/core/compile/captions.ts` builds a per-clip `.ass`
subtitle file (`buildAss`) with clip-relative timings, and
`src/core/compile/filters.ts`'s `subtitlesChain` applies it with the ffmpeg `subtitles`
filter (`subtitles=filename='...':fontsdir='...'`). A libre font (Liberation Sans, SIL
OFL) is bundled at `assets/fonts/caption.ttf` so caption rendering is reproducible on any
machine without a system font dependency; `resolveFont()` (`src/core/compile/font.ts`)
falls back to common system fonts if the bundled one is ever missing, and skips captions
(not fatal) if no font resolves at all.

ASS gives lower-third/centered styling via named `[V4+ Styles]` sections rather than
per-call `drawtext` positioning math, and libass's timestamp format required its own
careful centisecond-carry handling (fixed in the code review, see commit history) since a
naive `Math.round((frac)*100)` can emit an invalid `.100` for fractions rounding up.

## Consequences

- Caption rendering does not depend on `drawtext`/libfreetype at all — only libass, which
  the bundled binary has.
- The PNG-overlay path was **not built**; if the bundled `ffmpeg-static` version ever drops
  libass, that's the documented fallback to revisit.
- Font licensing must stay redistribution-safe (Liberation Sans is SIL OFL — fine for a
  public repo).
