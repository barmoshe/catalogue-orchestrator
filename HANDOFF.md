# HANDOFF — catalogue-orchestrator

_v1 complete. All tasks from the "finish + review + docs" pass are done and pushed._

## Where it stands

| Phase | State |
|---|---|
| 0–5 (scaffold → ingest → RAG → orchestrate → compile → UI) | ✅ done, committed + pushed |
| Code review (2 passes: HIGH, then MED/LOW) | ✅ done, 26 regression tests, committed + pushed |
| Docs (README/CLAUDE.md/AGENTS.md + 3 ADRs, dead-dep cleanup) | ✅ done, committed + pushed |
| Workshop-side STATUS.md / CLAUDE.md (bar_builds) | ✅ done, committed + pushed |

Repo: https://github.com/barmoshe/catalogue-orchestrator
Presentation (live): https://barmoshe.github.io/catalogue-orchestrator/

## Verified working

- CLI: `co ingest|list|index|search|plan|render|auto` — full pipeline on the `local`
  tier (no keys), real 9:16/1:1/16:9 MP4s with audio + libass-burned captions.
- Studio UI: verified live in-browser (query → plan → render → 1080×1920 video →
  regenerate produces a fresh cut).
- Gates: `tsc --noEmit`, `vitest run` (26 tests), `eslint .`, `next build` all green
  as of the last commit (`db4df57`).
- Two real end-to-end render smoke tests after the code-review passes (highlights +
  assembly mode, exercising every asset kind: video, image, audio).

## If picking this back up

Nothing is blocking. Open, non-blocking items (see `STATUS.md` in the workshop repo
and the sibling's own docs for detail):
- Real API keys + a curated demo catalogue would exercise the non-local provider tier.
- The presentation's slide-4 diagram (catalogue-library + RAG flow) is marked WIP in
  its own code comment — Bar may want to refine it further.
- The vector store is dependency-free JSON+cosine (ADR 0003) — fine at personal/demo
  scale; LanceDB/sqlite-vec is the documented swap if the catalogue ever outgrows it.

## Notes for future work in this repo
- ESLint uses the Next 16 flat config (`next lint` is gone); `npm run lint` = `eslint .`.
- Relative TS imports must stay extensionless (no `.js`) — Turbopack won't resolve
  `.js` specifiers pointing at `.ts` files when bundling `core/*` into the API routes.
- `.env.example` is hook-blocked in the workshop repo's safety hooks (secret-glob false
  positive) — env vars are documented in `README.md` instead.
