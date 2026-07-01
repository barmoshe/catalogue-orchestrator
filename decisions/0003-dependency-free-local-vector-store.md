# 0003 — A dependency-free local vector store, LanceDB deferred

Date: 2026-07-01
Status: Accepted

## Context

DESIGN.md names LanceDB as the default vector store (embedded, local, zero-infra,
multimodal-friendly), with sqlite-vec as the documented fallback. Both are real options,
but both are native-module dependencies (LanceDB ships a Rust/N-API addon; sqlite-vec is
a SQLite extension). For a `local`-tier engine whose whole point is "runs anywhere, no
network, no accounts, no install friction," an extra native dependency is a real cost:
platform-specific prebuilds, Electron `asarUnpack` complexity beyond what's already needed
for ffmpeg, and a slower/heavier `npm install` for what the actual catalogue sizes (a
personal or small-team media library, not a production search index) don't yet need.

## Decision

Ship a **dependency-free `LocalVectorStore`** (`src/core/index/localStore.ts`) implementing
the same `VectorStore` interface (`src/core/index/store.ts`) LanceDB or sqlite-vec would:
`upsert` / `search` / `keyword` / `all` / `size`. It persists vectors as JSON
(`.catalogue/index.json`, atomic tmp+rename write) and does brute-force cosine similarity
for semantic search plus a simple tf scorer for keyword search, fused via canonical
reciprocal-rank fusion (`reciprocalRankFusion`). Structured pre-filtering
(`passesFilter`/`StructuredFilter`) runs before either search, per DESIGN's hybrid-retrieval
design.

The `VectorStore` interface is the seam: swapping in LanceDB or sqlite-vec later is a
one-file change (`getStore()` in `src/core/index/embed.ts`), not a design change.

## Consequences

- Zero native dependencies for the retrieval path; `npm install` stays fast and portable.
- Brute-force cosine over JSON does not scale to a large catalogue (thousands+ of
  segments) — acceptable for the personal/demo scale this engine targets today; revisit
  via this ADR's successor if the catalogue outgrows it.
- The interface parity means this was a deliberately reversible choice, not a rewrite risk.
