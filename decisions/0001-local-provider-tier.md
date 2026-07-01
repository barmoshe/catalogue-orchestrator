# 0001 — A deterministic `local` provider tier, not just a mock

Date: 2026-07-01
Status: Accepted

## Context

`DESIGN.md` calls for OpenAI Whisper (transcription), a vision model (frame captions),
OpenAI embeddings, and Anthropic Claude (EDL authoring). Building against real APIs from
the start would make the engine impossible to run, test, or demo without API keys and
network access — and CI, a fresh clone, or a quick local demo shouldn't require either.

## Decision

Every AI seam (`TranscriptionProvider`, `VisionProvider`, `EmbeddingsProvider`,
`LlmProvider` in `src/core/providers/types.ts`) gets **two implementations**: a real one
following the weatherv1-next request shapes (forced Anthropic tool-use + `zodToJsonSchema`,
Whisper `verbose_json`, OpenAI embeddings/vision), and a **deterministic `local` one** with
no network calls:

- `LocalEmbeddings` — a hashed bag-of-words vector (stable, cosine-meaningful).
- `LocalTranscription` — an honest empty transcript (never invents speech).
- `LocalVision` — a plain caption derived from the filename/context (never invents visual
  content it can't see).
- `LocalLlm` + `planLocal.ts` — a heuristic EDL planner (salience/score ranking,
  duration-capped, transcript captions, feedback-aware refine) that produces a
  `validateEdl`-passing EDL without a model call.

`getProviders()` (`src/core/providers/index.ts`) selects per-seam based on `LLM_PROVIDER`
and which keys are present; `local` is the default when no keys exist. Each seam degrades
independently — e.g. an `OPENAI_API_KEY` alone upgrades transcription/vision/embeddings
while the LLM still falls back to the local heuristic.

## Consequences

- The **entire pipeline** (ingest → index → retrieve → orchestrate → compile) runs and
  renders a real MP4 with zero API keys, in CI, offline, on a fresh clone.
- Real keys swap in transparently via `.env` + `LLM_PROVIDER=auto` — no code change.
- The local planner had to be genuinely robust (see ADR-adjacent bug fixes in the code
  review: clamp-last duration handling, caption-endSec bounds) since it's exercised on
  every real render, not just as a stub.
