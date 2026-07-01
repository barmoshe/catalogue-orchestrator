# CLAUDE.md — catalogue-orchestrator

Project map for agents working in this repo. Build conventions are in `AGENTS.md` — read
that too.

## What this is

A local-first, domain-agnostic AI video orchestrator: a catalogue of media + an intent →
AI-planned, schema-validated **EDL** (auto-edit) → deterministic ffmpeg **compiler** →
MP4s (auto-cut). One engine, two modes (highlights / assembly), a preview/refine loop via
a Next.js studio UI. Sibling of the operator repo `bar_builds`; the design canon lives
there at `lab/personal/catalogue-orchestrator/` (`brief.md`, `scope.md`, `DESIGN.md`).
A GitHub Pages presentation lives at `docs/` (deployed to
`barmoshe.github.io/catalogue-orchestrator`).

## Map (matches the actual tree — keep this in sync)

```
src/
  core/
    schema/        zod: AssetCard, SegmentCard, EDL, Intent  (one source of truth)
    media/         resolve ffmpeg-static / ffprobe-static binaries + spawn (arg arrays)
    ingest/        probe, sceneDetect, sampleFrames, deriveSignals, ingest.ts, persist.ts
    index/         store.ts (VectorStore interface), localStore.ts (the impl), embed.ts
    retrieve/      retrieve.ts — hybrid RAG: structured filter -> semantic -> keyword/RRF
    orchestrate/   orchestrate.ts (entry), planLocal.ts + planModel.ts, validate.ts
    compile/       edlToFfmpeg.ts (PURE), filters.ts, captions.ts (libass/ASS), font.ts,
                   run.ts (spawn+lock+ffprobe), compile.ts (orchestrates a render)
    providers/     llm/ embeddings/ vision/ transcription/ — real + `local` impls, index.ts selects
    jobs/          store.ts (Map + atomic jobs.json mirror), worker.ts (queue/drain + crash recovery)
    util/          hash.ts (content-hash idempotency)
  app/
    api/           catalogue, keyframe, plan, render, jobs/[id] (+ /video) — see AGENTS.md
    studio/        Studio.tsx — the refine-loop UI (client component), mounted at "/"
cli/               co.ts — ingest|list|index|search|plan|render|auto, drives core headless
test/              vitest: schema/compile/orchestrate/retrieve — 26 tests
electron/          desktop shell (main.cjs runs the standalone Next server as a child)
docs/              the GitHub Pages presentation (self-contained animated HTML)
decisions/         ADRs for choices that diverged from DESIGN.md (local vector store,
                   libass captions, the local provider tier)
.catalogue/        generated cards + keyframes + index.json          (gitignored)
runtime/           jobs.json + per-job temp render dirs + outputs    (gitignored)
```

## The one rule that matters most

**The AI only emits a zod-validated EDL; it never writes ffmpeg.** Everything else follows
from keeping that boundary clean. See `AGENTS.md` rule 1 and `src/core/orchestrate/validate.ts`.

## Provider tiers

No keys required to run: `LLM_PROVIDER=local` (the default with no keys) uses deterministic
stand-ins for every AI seam so the full pipeline renders a real MP4 offline — this is what
the CLI and unit tests run on. Real keys swap the same interfaces to Whisper / OpenAI
embeddings / Claude, selected per-seam by `getProviders()` (`src/core/providers/index.ts`).
Keys in `.env` only. See `decisions/0001-local-provider-tier.md`.

## Two divergences from DESIGN.md worth knowing before you touch compile/ or index/

- **Vector store is dependency-free**, not LanceDB — `src/core/index/localStore.ts`
  (brute-force cosine + tf keyword over JSON). Same `VectorStore` interface LanceDB would
  implement; swapping it in later is a one-file change. See `decisions/0003`.
- **Captions burn via libass/ASS**, not `drawtext` — the bundled `ffmpeg-static` has libass
  but not drawtext. `src/core/compile/captions.ts` + `assets/fonts/caption.ttf`. See
  `decisions/0002`.

## Running it

```
npm run dev                                  # studio UI at http://localhost:3000
npm run co -- ingest <dir> && npm run co -- index   # headless: build the catalogue + index
npm run co -- auto highlights "query" --out out.mp4  # headless: plan + render in one step
npm test && npm run lint && npm run build    # the gates (see AGENTS.md)
```
