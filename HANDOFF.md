# HANDOFF — catalogue-orchestrator

_Resume point. Last worked: code-review fixes applied (uncommitted)._

## Where it stands

| Phase | State |
|---|---|
| 0–4 (scaffold → ingest → RAG → orchestrate → compile) | ✅ done, committed + pushed |
| 5 — UI + refine loop (studio) | ✅ done, committed + pushed, **verified in browser** (query → plan → render → 1080×1920 video → regenerate makes a fresh cut) |
| Code review | ✅ done (adversarial pass; report below) |
| Code-review fixes | 🚧 **applied but UNCOMMITTED + UNVERIFIED** |
| Update all docs | ⬜ pending |

Repo: https://github.com/barmoshe/catalogue-orchestrator · Presentation (live): https://barmoshe.github.io/catalogue-orchestrator/

## ▶ FIRST next session: verify + commit the fixes

The review fixes are edited into the working tree but **not yet verified or committed**. Run:
```
cd ../catalogue-orchestrator
npx tsc --noEmit && npx vitest run && npm run lint && npx next build
```
If green, commit (`fix: code-review pass — atomicity, range/path safety, scene-detect, planLocal clamp`) and push. If red, fix the regressions first.

### Fixes already applied (HIGH + 1 MED)
- **H1** `compile/captions.ts` — `toAssTime` centisecond carry (no more out-of-range `.100`).
- **H2** `api/keyframe/route.ts` — realpath + `sep` confinement (no traversal/symlink/prefix escape).
- **H3** `api/jobs/[id]/video/route.ts` — Range clamp + 416 + `bytes=-N` suffix + `try/finally` fd close.
- **H4** `jobs/worker.ts` + `api/jobs/[id]/route.ts` — `recoverPending()` re-enqueues stuck jobs on boot.
- **H5** `index/localStore.ts` — atomic tmp+rename write; load wrapped in try/catch (corrupt index ≠ bricked).
- **H6** `ingest/persist.ts` — atomic card write; `loadCatalogue` skips a corrupt card instead of failing all.
- **H7** `media/spawn.ts` `keepFullStderr` option, used by `sceneDetect` + `deriveSignals` (no lost cuts on long video); scene-score regex hardened against cross-frame pairing.
- **MED** `orchestrate/planLocal.ts` — clamp-LAST so a tail-of-video segment can't produce `sourceOut > assetDur` (was the most likely cause of a normal auto-cut failing validateEdl); `fallbackClip` clamped + throws on empty instead of emitting `segmentId: ""`.

### Still TODO from the review (MED/LOW — not yet fixed)
- `jobs/store.ts` — make `jobs.json` write atomic (tmp+rename); stop swallowing write errors.
- `api/render` + `api/plan` + job `error` — return generic messages, don't echo raw `err.message` (leaks zod internals / ffmpeg abs paths). Log server-side.
- `index/store.ts` — RRF `1/(c+rank+1)` (avoid `c=0` → Infinity); filter non-finite cosine scores before top-k.
- `index/store.ts` — `StructuredFilter.kind` is a silent no-op: implement in `passesFilter` (needs asset lookup) or delete the field.
- `ingest/ingest.ts` — null-duration assets give a `[0,0]` window (image/audio): give them a nominal window; assign boundary-straddling transcript text by midpoint (currently double-counted).
- `ingest/sampleFrames.ts` — keyframe filename uses `assetId.slice(0,12)`; use the full hash (collision clobbers another asset's frame).
- `sceneDetect.ts:mergeShort` — a short FIRST window is never merged (no `prev`).
- `validateEdl` — also assert music `assetId` is `kind==="audio"`; clamp caption `endSec` to clip duration.
- LOW: tokenizer drops non-Latin scripts; full-file `readFile` for non-range video responses; `LocalVectorStore.loaded` never resets.

_The review said these checked out CLEAN: concat `-c copy` (identical segment params), per-clip audioMap indexing, sha256 idempotency, scene-detect EOF/zero-cut fallback, planModel bounded retry, the video id regex._

## Then: update all docs (last task)
- **ADRs** (in the sibling `decisions/` AND note in bar_builds `lab/personal/catalogue-orchestrator/decisions/`): (1) the `local` provider tier, (2) **libass/ASS captions not drawtext** (bundled ffmpeg-static 6.1.1 lacks the drawtext filter; font bundled at `assets/fonts/caption.ttf`), (3) **local vector store** first (LanceDB = documented swap).
- Refresh `README.md`, `CLAUDE.md`, `AGENTS.md` to the final state (all 6 phases). Update `lab/personal/catalogue-orchestrator/STATUS.md` in bar_builds.

## Verified working (CLI + browser, local tier, no keys)
```
co ingest <dir> · co index · co search <q> · co plan ... · co render <edl.json> · co auto highlights ...
npm run dev      # studio UI; preview launch config "co-app" → port 4311 (.catalogue already populated)
```
19 unit tests pass. Real 9:16/1:1/16:9 MP4s with audio + libass captions.

## Notes
- ESLint uses the **Next 16 flat config** (`next lint` is gone); `npm run lint` = `eslint .`.
- `.env.example` was hook-blocked → env documented in `README.md`.
- bar_builds `main` push to default branch is gated by the auto-mode classifier (needs an explicit OK).
