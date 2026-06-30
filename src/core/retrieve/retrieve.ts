import { getProviders } from "../providers/index.js";
import type { Providers } from "../providers/types.js";
import { getStore } from "../index/embed.js";
import { reciprocalRankFusion, type ScoredSegment, type StructuredFilter, type VectorStore } from "../index/store.js";
import type { Intent } from "../schema/intent.js";

export type RetrieveOptions = {
  query: string;
  filter?: StructuredFilter;
  k?: number;
  env?: NodeJS.ProcessEnv;
  providers?: Providers;
  store?: VectorStore;
};

/**
 * Hybrid retrieval (DESIGN §5): structured pre-filter (in the store) → semantic vector
 * search → keyword search → reciprocal-rank fusion. Returns the top-k ranked segments
 * with fused scores. Never returns the whole catalogue — RAG is what makes this scale.
 */
export async function retrieve(opts: RetrieveOptions): Promise<ScoredSegment[]> {
  const env = opts.env ?? process.env;
  const providers = opts.providers ?? getProviders(env);
  const store = opts.store ?? getStore(env);
  const filter = opts.filter ?? {};
  const k = opts.k ?? 12;

  const pool = k * 3;
  const [queryVec] = await providers.embeddings.embed([opts.query || " "]);
  const semantic = await store.search(queryVec, filter, pool);
  const keyword = await store.keyword(opts.query, filter, pool);

  // If the query had no usable keyword tokens, semantic carries it alone.
  const fused = reciprocalRankFusion(keyword.length ? [semantic, keyword] : [semantic], k);
  return fused;
}

/** Build the structured filter a mode implies (Mode A pins the source asset + salience). */
export function filterForIntent(intent: Intent): StructuredFilter {
  if (intent.mode === "highlights") {
    return {
      assetId: intent.assetId,
      minSalience: 0.12,
      // highlight clips want trimmable, self-contained moments
      minDurationSec: 0.4,
    };
  }
  // assembly: keep candidates usable in a reel; the orchestrator trims further
  return { maxDurationSec: Math.max(2, intent.maxDurationSec) };
}
