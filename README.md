# catalogue-orchestrator

A **local-first, domain-agnostic AI video orchestrator**. Give it (1) a **catalogue** —
any folder of media (video clips, stills, audio) — and (2) an **intent** — either "find
the highlights of this" or a short text brief. It **ingests** the catalogue into rich
structured **cards**, **indexes** them for **RAG**, lets an AI **orchestrator** author a
schema-validated **Edit Decision List (EDL)** (this is *auto-edit*), and a deterministic
ffmpeg **compiler** turns that EDL into finished MP4s (this is *auto-cut*). One engine,
two modes (highlights and assembly), with a preview/refine loop.

Design principle #1: **the AI only ever emits a schema-validated EDL — it never writes
ffmpeg.** All ffmpeg lives in one deterministic, unit-tested compiler. The AI's mistakes
stay bounded; the output stays reproducible.

> Status: in active development. Phase 0 (scaffold + desktop shell) is in; the ingest →
> RAG → orchestrate → compile → UI pipeline lands phase by phase. See the build plan in
> the workshop design canon and this repo's commit history.

## Runs with no API keys

The engine ships a deterministic **`local` provider tier**: hashed embeddings, stub
captions/transcripts, and a heuristic EDL planner. With `LLM_PROVIDER=local` (the default
when no keys are present) the **entire pipeline runs end to end and renders a real MP4** —
offline, in CI, no accounts. Drop real keys into `.env` and the same code paths swap to
real models (Whisper, vision captions, OpenAI embeddings, Claude EDL authoring). No code
change.

## Prerequisites

- Node 20+ (developed on Node 26)
- No system ffmpeg required — `ffmpeg-static` / `ffprobe-static` binaries are bundled and
  resolved at runtime.

## Run

```bash
npm install
npm run dev          # web app at http://localhost:3000
# in a second terminal, for the desktop shell:
npm run electron:dev # Electron window pointed at the dev server
```

Headless / CLI (drives the core engine without the UI):

```bash
npm run co -- ingest <media-dir>     # build catalogue cards
npm run co -- plan <intent.json>     # author an EDL
npm run co -- render <edl.json>      # compile EDL -> MP4
```

## Build & gates

```bash
npm run build   # next build (standalone output)
npm test        # vitest
npm run lint    # eslint (incl. jsx-a11y for the UI)
```

## Desktop (Electron)

`npm run electron:dev` opens the dev app in a desktop window. Production packaging
(`npm run package` / `npm run make`) is configured — the ffmpeg binaries and the LanceDB
native addon are `asarUnpack`ed so they can execute, and `scripts/prepare-standalone.cjs`
copies the Next static assets into the standalone tree. Producing a signed installer is a
later, deliberate step; the source builds and runs as-is.

## Configuration (env)

Create a `.env` file in the repo root. The engine runs without any of these (it falls back
to the `local` tier); set them only for real AI quality. **Keys live in `.env` only — never
commit them.**

| Var | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `local` | `local` \| `anthropic` \| `openai` \| `auto` (prefer anthropic if its key is set, else openai, else local) |
| `ANTHROPIC_API_KEY` | — | Claude (EDL authoring + vision captions) |
| `OPENAI_API_KEY` | — | Whisper transcription + embeddings + OpenAI LLM |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Anthropic model id |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI LLM model id |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | embedding model |
| `WHISPER_MODEL` | `whisper-1` | transcription model |
| `FFMPEG_PATH` / `FFPROBE_PATH` | bundled static | override the ffmpeg/ffprobe binaries |
| `CATALOGUE_DIR` | `.catalogue` | where catalogue cards + keyframes + the vector index live (gitignored) |
| `RUNTIME_DIR` | `runtime` | jobs.json + temp render dirs + outputs (gitignored) |

## Architecture

```
media folder ─▶ INGEST ─▶ INDEX ─▶ RETRIEVE(RAG) ─▶ ORCHESTRATE(EDL) ─▶ COMPILE(ffmpeg) ─▶ MP4 ─▶ PREVIEW/REFINE
```

Clean core/adapters split (`src/core/*`) so every stage is unit-testable headless. See
`AGENTS.md` for the build conventions and `CLAUDE.md` for the project map.

## License

MIT
