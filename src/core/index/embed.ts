import { loadCatalogue } from "../ingest/persist";
import { getProviders } from "../providers/index";
import type { Providers } from "../providers/types";
import { LocalVectorStore } from "./localStore";
import type { VectorStore } from "./store";

/** Resolve the default store (local; LanceDB is the documented swap). */
export function getStore(env: NodeJS.ProcessEnv = process.env): VectorStore {
  return LocalVectorStore.fromEnv(env);
}

/**
 * Build (or refresh) the index: embed every segment's `embeddingText` via the active
 * embeddings provider and upsert into the store. Batched to keep a single provider call
 * for the local tier and a bounded number for the real one.
 */
export async function buildIndex(opts: {
  env?: NodeJS.ProcessEnv;
  providers?: Providers;
  store?: VectorStore;
  onProgress?: (done: number, total: number) => void;
} = {}): Promise<number> {
  const env = opts.env ?? process.env;
  const providers = opts.providers ?? getProviders(env);
  const store = opts.store ?? getStore(env);
  const { segments } = await loadCatalogue(env);
  if (segments.length === 0) return 0;

  const BATCH = 96;
  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH);
    const vectors = await providers.embeddings.embed(batch.map((s) => s.embeddingText));
    await store.upsert(batch.map((s, j) => ({ segment: s, vector: vectors[j] })));
    opts.onProgress?.(Math.min(i + BATCH, segments.length), segments.length);
  }
  return segments.length;
}
