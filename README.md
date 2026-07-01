# catalogue-orchestrator

A **local-first, domain-agnostic AI video orchestrator**. Give it (1) a **catalogue** —
any folder of media (video clips, stills, audio) — and (2) an **intent** — either "find
the highlights of this" or a short text brief. It **ingests** the catalogue into rich
structured **cards**, **indexes** them for **RAG**, lets an AI **orchestrator** author a
schema-validated **Edit Decision List (EDL)** (this is *auto-edit*), and a deterministic
ffmpeg **compiler** turns that EDL into finished MP4s (this is *auto-cut*). One engine,
two modes (highlights and assembly), with a browser preview/refine loop.

Design principle #1: **the AI only ever emits a schema-validated EDL — it never writes
ffmpeg.** All ffmpeg lives in one deterministic, unit-tested compiler. The AI's mistakes
stay bounded; the output stays reproducible.

**[See the presentation →](https://barmoshe.github.io/catalogue-orchestrator/)** — an
animated walkthrough of the engine, its two live diagrams, and the design.

## Runs with no API keys

The engine ships a deterministic **`local` provider tier**: hashed embeddings, honest
empty-by-default captions/transcripts, and a heuristic EDL planner. With `LLM_PROVIDER=local`
(the default when no keys are present) the **entire pipeline runs end to end and renders a
real MP4** — offline, in CI, no accounts, no native dependencies. Drop real keys into
`.env` and the same code paths swap to real models (Whisper, vision captions, OpenAI
embeddings, Claude EDL authoring). No code change.

## Prerequisites

- Node 20+ (developed on Node 26)
- No system ffmpeg required — `ffmpeg-static` / `ffprobe-static` binaries are bundled and
  resolved at runtime.

## Run

```bash
npm install
npm run dev          # studio UI at http://localhost:3000
# in a second terminal, for the desktop shell:
npm run electron:dev # Electron window pointed at the dev server
```

The studio: a catalogue browser (keyframe thumbnails, tags, transcript snippets), an
intent form (mode / query / aspect / max duration), an EDL timeline preview with the
planner's rationale, an inline 9:16/1:1/16:9 player, and **Accept / Regenerate** with
free-text feedback for the refine loop.

Headless / CLI (drives the core engine without the UI):

```bash
npm run co -- ingest <media-dir>              # probe + scene-detect -> catalogue cards (idempotent by content hash)
npm run co -- index                           # embed every segment into the local vector store
npm run co -- search <query>                  # hybrid RAG ranking, for a quick sanity check
npm run co -- plan highlights <query> --out edl.json    # auto-edit: intent -> a validated EDL
npm run co -- render edl.json --out cut.mp4             # auto-cut: EDL -> a real MP4
npm run co -- auto highlights <query> --out cut.mp4     # plan + render in one step
```

`plan`/`auto` flags: `--aspect 9:16|1:1|16:9`, `--max <seconds>`, `--asset <id>` (Mode A:
pin one source asset), `--feedback "..."` (regenerate against a previous cut).

## Build & gates

```bash
npm run build   # next build (standalone output)
npm test        # vitest — 26 tests, core is fully unit-testable headless
npm run lint    # eslint (Next 16 flat config; jsx-a11y for the UI)
```

For any render: `ffprobe` the output (resolution, duration, audio stream present) and
eyeball a frame — see `AGENTS.md` for the full verify loop.

## Desktop (Electron)

`npm run electron:dev` opens the dev app in a desktop window. Production packaging
(`npm run package` / `npm run make`) is configured — the ffmpeg binaries are
`asarUnpack`ed so they can execute inside the packaged app, and
`scripts/prepare-standalone.cjs` copies the Next static assets into the standalone tree.
Producing a signed installer is a later, deliberate step; the source builds and runs as-is.

## Configuration (env)

Create a `.env` file in the repo root. The engine runs without any of these (it falls back
to the `local` tier); set them only for real AI quality. **Keys live in `.env` only — never
commit them.**

| Var | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `local` | `local` \| `anthropic` \| `openai` \| `auto` (prefer anthropic if its key is set, else openai, else local) |
| `ANTHROPIC_API_KEY` | — | Claude (EDL authoring) |
| `OPENAI_API_KEY` | — | Whisper transcription + embeddings + vision captions + OpenAI LLM |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Anthropic model id |
| `OPENAI_MODEL` | `gpt-4o` | OpenAI LLM / vision model id |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | embedding model |
| `WHISPER_MODEL` | `whisper-1` | transcription model |
| `FFMPEG_PATH` / `FFPROBE_PATH` | bundled static | override the ffmpeg/ffprobe binaries |
| `CAPTION_FONT` | bundled `assets/fonts/caption.ttf` | override the caption font (libass) |
| `CATALOGUE_DIR` | `.catalogue` | where catalogue cards + keyframes + the vector index live (gitignored) |
| `RUNTIME_DIR` | `runtime` | jobs.json + per-job temp render dirs + outputs (gitignored) |

## Architecture

```
media folder ─▶ INGEST ─▶ INDEX ─▶ RETRIEVE(RAG) ─▶ ORCHESTRATE(EDL) ─▶ COMPILE(ffmpeg) ─▶ MP4 ─▶ PREVIEW/REFINE
```

Clean core/adapters split (`src/core/*`) so every stage is unit-testable headless; the
Next.js studio and the `co` CLI are two thin adapters over the same core. See `AGENTS.md`
for the build conventions, `CLAUDE.md` for the project map, and `decisions/` for the ADRs
that record where the build diverged from the original design (a dependency-free vector
store instead of LanceDB; libass/ASS captions instead of `drawtext`).

## License

MIT
