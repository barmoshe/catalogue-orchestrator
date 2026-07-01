# HANDOFF — catalogue-orchestrator

_Resume point. Last worked: code-review pass 2 (MED/LOW) applied, uncommitted._

## Where it stands

| Phase | State |
|---|---|
| 0–4 (scaffold → ingest → RAG → orchestrate → compile) | ✅ done, committed + pushed |
| 5 — UI + refine loop (studio) | ✅ done, committed + pushed, **verified in browser** (query → plan → render → 1080×1920 video → regenerate makes a fresh cut) |
| Code review | ✅ done (adversarial pass; report in git log of commit `5e880c7`) |
| Code-review fixes — pass 1 (HIGH + planLocal clamp) | ✅ **committed** at `5e880c7`, pushed to origin/main |
| Code-review fixes — pass 2 (MED/LOW) | 🚧 **applied but UNCOMMITTED** (9 files dirty) — tsc/vitest/lint NOT re-verified after this pass |
| Update all docs | ⬜ pending |

Repo: https://github.com/barmoshe/catalogue-orchestrator · Presentation (live): https://barmoshe.github.io/catalogue-orchestrator/

## ▶ FIRST next session: verify + commit pass 2

9 files are dirty (`git status --short` in the repo): `src/app/api/plan/route.ts`, `src/app/api/render/route.ts`, `src/core/index/store.ts`, `src/core/ingest/ingest.ts`, `src/core/ingest/sampleFrames.ts`, `src/core/ingest/sceneDetect.ts`, `src/core/jobs/store.ts`, `src/core/orchestrate/planLocal.ts`, `src/core/orchestrate/validate.ts`. Run:
```
cd ../catalogue-orchestrator
npx tsc --noEmit && npx vitest run && npm run lint && npx next build
```
Then a render smoke test (same pattern as pass 1's commit): `npm run co -- index && npm run co -- auto highlights "motion" --max 10 --out /tmp/smoke.mp4` and ffprobe-check the output. If green, commit (`fix: code-review pass 2 — RAG/atomicity/validate MED+LOW findings`) and push.

**I was mid-way through adding regression tests** (in `test/orchestrate.test.ts`, following the existing `asset()`/`seg()`/`CAT` helpers already in that file) for: the caption-endSec clamp, the tail-of-video clamp, and music-must-be-audio validation, when this session paused. Worth adding before/with the commit — not required to ship, but each pass-2 fix below is otherwise untested.

### Pass 2 fixes applied (uncommitted)
- `jobs/store.ts` — `jobs.json` write is now atomic (tmp+rename); write errors no longer swallowed.
- `api/render/route.ts`, `api/plan/route.ts` — added `console.error` server-side logging before returning the (still-raw, by design for this local-first tool) error message; noted in-code that a hosted deploy should genericize it.
- `index/store.ts` — RRF now `1/(c+rank+1)` (canonical, and safe at `c=0`); `cosine()` filters non-finite scores to 0; **removed** the dead/no-op `StructuredFilter.kind` field entirely (was never read by `passesFilter`).
- `ingest/ingest.ts` — still/audio assets get a nominal 2.5s window instead of degenerate `[0,0]`; `windowTranscript` now assigns each transcript line to its ONE window by midpoint (was double-counting boundary-straddling lines into both neighboring windows).
- `ingest/sampleFrames.ts` — keyframe filenames use the full content hash, not `assetId.slice(0,12)` (was a collision risk).
- `sceneDetect.ts` — `mergeShort` now also merges a short FIRST window forward (previously only merged backward, so a short first window always survived unmerged).
- `orchestrate/validate.ts` — now also rejects a caption whose `endSec` exceeds its own clip's duration, and rejects `music.assetId` that isn't `kind==="audio"`.
- `orchestrate/planLocal.ts` — caption `endSec` is clamped to `min(clipDur, ...)` so it can't trip the new validateEdl check above (this was a real bug: the old `Math.max(1, clipDur-0.2)` could exceed clipDur for short clips).

### Still open from the review (LOW, not fixed — low priority)
- Tokenizer (`providers/embeddings/local.ts`) drops non-Latin scripts + single-char tokens → non-English keyword search returns nothing (no crash, just reduced recall).
- `/api/jobs/[id]/video` reads the whole file into memory for non-Range requests (fine for short local clips; would matter for long renders).
- `LocalVectorStore.loaded` flag never resets on a long-lived shared instance (edge case; each CLI/API invocation is a fresh process today).
- Content-hash cache key ignores `path` — a moved/renamed copy of the same bytes resolves to the old path in the card (cosmetic; the hash-based dedup itself is correct).

_The review said these checked out CLEAN and need no fix: concat `-c copy` (identical segment params), per-clip audioMap indexing, sha256 idempotency, scene-detect EOF/zero-cut fallback, planModel bounded retry, the video id regex._

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
