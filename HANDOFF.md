# HANDOFF — catalogue-orchestrator

_Resume point for the next session. Last worked: Phase 5 (UI) in progress._

## Where it stands

| Phase | State |
|---|---|
| 0 — Scaffold (Next 16 + Electron shell) | ✅ done, committed + pushed |
| 1 — Ingest → cards | ✅ done, committed + pushed |
| 2 — Index + hybrid RAG | ✅ done, committed + pushed |
| 3 — Orchestrate (auto-edit, local + model) | ✅ done, committed + pushed |
| 4 — Compile (auto-cut, real MP4s) | ✅ done, committed + pushed |
| 5 — UI + refine loop | 🚧 **in progress, UNCOMMITTED** |
| Code review + fixes | ⬜ pending |
| Update all docs | ⬜ pending |

Repo: https://github.com/barmoshe/catalogue-orchestrator
Presentation (GitHub Pages, live): https://barmoshe.github.io/catalogue-orchestrator/

## Verified working (CLI, local tier, no keys)

```
npm run co -- ingest <media-dir>     # → catalogue cards (idempotent by content hash)
npm run co -- index                  # → embed segments into the local vector store
npm run co -- search <query>         # → hybrid RAG ranking
npm run co -- plan highlights ...    # → a validated EDL
npm run co -- auto highlights ...    # → plan + render a real MP4
```
Rendered real 9:16 / 1:1 / 16:9 MP4s with audio + a libass-burned caption. 19 unit tests pass.

## Phase 5 — what's done vs left (THIS is the resume point)

**Done (uncommitted), under `src/core/jobs/` + `src/app/api/`:**
- `core/jobs/store.ts` — in-memory Map + `runtime/jobs.json` mirror.
- `core/jobs/worker.ts` — queue + drain + `runJob` (calls `compileEdl`); `enqueueRender`, `outputPathFor`.
- API routes: `/api/catalogue`, `/api/keyframe`, `/api/plan`, `/api/render`, `/api/jobs/[id]`, `/api/jobs/[id]/video` (Range-aware MP4 streaming).

**Left to do:**
1. **The studio UI** — `src/app/page.tsx` (or a `/studio` client component): catalogue browser (fetch `/api/catalogue`, show keyframes), intent form (mode / query / aspect / duration), EDL timeline preview + rationale, render button → poll `/api/jobs/[id]` → `<video>` player, and **Accept / Regenerate(feedback)** for the refine loop.
2. **Verify in browser** (preview tools): both modes run browser → MP4 on the local tier; regenerate visibly changes the output. Screenshot it. (Satisfies the `scope.md` acceptance criteria.)
3. **Code review + fixes**, then **update all docs**.

## ⚠️ Important note before continuing

I just stripped `.js` extensions from all relative imports in `src/`, `cli/`, `test/`
(36 files) so **Turbopack** can bundle `core/*` into the API routes — it would NOT
resolve the `.js` specifiers that tsx/tsc/vitest accept. **This change was NOT
re-verified** after the rewrite. **First thing next session:** run and confirm green:

```
npx tsc --noEmit
npx vitest run
npx next build
```

If the build still complains about `core/*` in routes, the remaining lever is Next's
`serverExternalPackages` (already set for ffmpeg/ffprobe/lancedb/proper-lockfile) or
moving heavy server-only imports behind dynamic `await import()` inside the route handlers.

## Conventions / decisions to fold into docs (pending)

- **`local` provider tier** = the no-key default; real OpenAI/Anthropic swap via `.env` + `LLM_PROVIDER`.
- **Captions = libass (ASS file) NOT drawtext** — bundled ffmpeg-static 6.1.1 has libass but not the drawtext filter. Font bundled at `assets/fonts/caption.ttf` (Liberation Sans, SIL OFL).
- **Vector store = dependency-free local cosine+keyword** (`LocalVectorStore`); LanceDB is the documented drop-in swap (interface in `core/index/store.ts`).
- These three are ADR-worthy and supersede DESIGN.md's defaults — log them in `decisions/`.

## Don't forget
- After Phase 5 verifies: commit + push the sibling; update `lab/personal/catalogue-orchestrator/STATUS.md` in the bar_builds repo.
- `.env.example` was hook-blocked; env is documented in `README.md` instead.
