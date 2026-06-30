# AGENTS.md — build conventions for catalogue-orchestrator

Read this before writing code here. It encodes the non-negotiable conventions; the
project map is in `CLAUDE.md`.

## The spine: verify, don't assume

ffmpeg flags, filter syntax, and AI model/endpoint names drift; training lags. Treat any
remembered filtergraph or SDK signature as a hypothesis. Before writing: confirm the
installed `ffmpeg -version`, check filters against the ffmpeg docs, and confirm the current
transcription/LLM model + request shape against the provider docs. When ffmpeg errors
contradict memory, ffmpeg is right.

## Hard rules

1. **AI proposes, the compiler disposes.** The AI ONLY ever emits a zod-validated EDL. It
   never writes ffmpeg. 100% of ffmpeg lives in `src/core/compile/`. Re-validate every
   model output: zod-parse it, and assert every `segmentId` exists + every `sourceIn/Out`
   is within range; on failure, re-prompt with the error — never hand-fix.
2. **`spawn` with an explicit arg ARRAY**, never a shell string. Stream stderr for
   progress, check exit codes, surface stderr on failure. Never interpolate untrusted
   input into a command string.
3. **Bundle the binaries.** Resolve `ffmpeg-static` / `ffprobe-static` paths at runtime via
   `src/core/media/` (honoring `FFMPEG_PATH`/`FFPROBE_PATH`). No system-ffmpeg assumption.
4. **Aspect fit = scale + pad/crop, never stretch.** `fit` = decrease + pad; `fill` =
   increase + crop; `blurpad` = blurred cover behind a contained foreground. Always
   `setsar=1`.
5. **Captions via PNG overlays.** Caption text is rendered to transparent PNGs and
   composited with the `overlay` filter (`enable='between(t,a,b)'`) — build-independent
   (the system ffmpeg here lacks `drawtext`; the bundled ffmpeg-static 6.1.1 has libass +
   libfreetype as a fallback, but overlay is the contract).
6. **Keys in `.env` only.** Never in a commit, artifact, or doc. The `local` provider tier
   keeps the whole pipeline runnable with no keys.
7. **Idempotent + cached.** Cards key off a content hash; re-ingest is a cache hit.
   Renders run one at a time behind a lock, in a unique temp dir, cleaned up after.

## Provider tiers

Every AI seam (LLM/EDL, embeddings, vision caption, transcription) sits behind an interface
in `src/core/providers/` with at least two impls: a real one (OpenAI/Anthropic, following
the weatherv1-next request shapes — forced Anthropic `tool_choice` + `zodToJsonSchema`;
Whisper `verbose_json`) and a deterministic `local` one. Selection via `LLM_PROVIDER`.
Tests and CI run on `local`.

## Stack

Next 16 (App Router, Turbopack) + React 19 + TS, `@/*` → `src/*`. Vitest (node env for
core; jsdom per-file for UI). Electron desktop shell (`electron/main.cjs`) runs the Next
`standalone` server as a managed child — the ffmpeg binaries + LanceDB native addon are
`asarUnpack`ed (they can't execute inside asar).

## Gates before "done"

`npm run build` (standalone) + `npm test` (vitest) + `npm run lint` (incl. `jsx-a11y`) all
green. For any render, `ffprobe` the output (resolution, duration, audio stream) and eyeball
a frame. Re-run on a clean temp dir to confirm no stale-state dependency.

## State

Log non-obvious decisions as ADRs in `decisions/`. The workshop pointer + design canon live
in the operator repo at `lab/personal/catalogue-orchestrator/` (brief, scope, DESIGN).
