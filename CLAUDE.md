# CLAUDE.md — catalogue-orchestrator

Project map for agents working in this repo. Build conventions are in `AGENTS.md` — read
that too.

## What this is

A local-first, domain-agnostic AI video orchestrator: a catalogue of media + an intent →
AI-planned, schema-validated **EDL** (auto-edit) → deterministic ffmpeg **compiler** →
MP4s (auto-cut). One engine, two modes (highlights / assembly), a preview/refine loop.
Sibling of the operator repo `bar_builds`; the design canon lives there at
`lab/personal/catalogue-orchestrator/` (`brief.md`, `scope.md`, `DESIGN.md`).

## Map

```
src/
  core/
    schema/        zod: AssetCard, SegmentCard, EDL, Intent  (one source of truth)
    media/         resolve ffmpeg-static / ffprobe-static binaries
    ingest/        probe, sceneDetect, sampleFrames, deriveSignals, caption, transcribe
    index/         VectorStore interface + LanceDB impl + embed
    retrieve/      hybrid RAG: structured filter -> semantic -> keyword/RRF fusion
    orchestrate/   planHighlights, planAssembly, validate (the auto-edit step)
    compile/       edlToFfmpeg (PURE: EDL->args), captionsPng, filters, run (the auto-cut step)
    providers/     llm / embeddings / vision / transcription — real + `local` impls
    jobs/          in-memory Map + jobs.json under proper-lockfile + queue/drain worker
  app/             Next App Router: /api/{ingest,retrieve,plan,render,jobs/[id]} + UI
test/              vitest: schema, edlToFfmpeg->args, retrieve ranking, validate loop
cli/               co ingest|plan|render — drives core headless
electron/          desktop shell (main.cjs runs the standalone Next server)
.catalogue/        generated cards + keyframes + lancedb index  (gitignored)
runtime/           jobs.json + temp render dirs + outputs       (gitignored)
```

## The one rule that matters most

**The AI only emits a zod-validated EDL; it never writes ffmpeg.** Everything else follows
from keeping that boundary clean. See `AGENTS.md` rule 1.

## Provider tiers

No keys required to run: `LLM_PROVIDER=local` uses deterministic stand-ins for every AI
seam so the full pipeline renders a real MP4 offline. Real keys swap the same interfaces to
Whisper / OpenAI embeddings / Claude. Keys in `.env` only.
