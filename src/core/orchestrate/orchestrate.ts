import { Intent } from "../schema/intent.js";
import type { EDL } from "../schema/edl.js";
import { loadCatalogue } from "../ingest/persist.js";
import { getProviders, isLocalLlm } from "../providers/index.js";
import type { Providers } from "../providers/types.js";
import { getStore } from "../index/embed.js";
import type { VectorStore } from "../index/store.js";
import { retrieve, filterForIntent } from "../retrieve/retrieve.js";
import { makeLookup, validateEdl } from "./validate.js";
import { planLocal } from "./planLocal.js";
import { planModel } from "./planModel.js";

export type OrchestrateOptions = {
  env?: NodeJS.ProcessEnv;
  providers?: Providers;
  store?: VectorStore;
};

export type OrchestrateResult = {
  edl: EDL;
  candidateCount: number;
  planner: string;
};

/**
 * Auto-edit: intent → retrieved candidates → a validated EDL. Routes to the deterministic
 * local planner or the real model planner based on the active LLM tier; both outputs pass
 * validateEdl before returning (the compiler only ever sees a valid EDL).
 */
export async function orchestrate(intentInput: unknown, opts: OrchestrateOptions = {}): Promise<OrchestrateResult> {
  const intent = Intent.parse(intentInput);
  const env = opts.env ?? process.env;
  const providers = opts.providers ?? getProviders(env);
  const store = opts.store ?? getStore(env);

  const cat = await loadCatalogue(env);
  if (cat.segments.length === 0) throw new Error("catalogue is empty — run `co ingest` then `co index` first.");
  const lookup = makeLookup(cat);

  const filter = filterForIntent(intent);
  let candidates = await retrieve({ query: intent.query, filter, k: 24, env, providers, store });

  // Fallback: if retrieval came back empty (e.g. an empty index), use filtered catalogue
  // segments directly so the planner still has material.
  if (candidates.length === 0) {
    const { passesFilter } = await import("../index/store.js");
    candidates = cat.segments.filter((s) => passesFilter(s, filter)).map((segment) => ({ segment, score: 0 }));
  }

  // Highlights are about visual moments: prefer video segments, but fall back to whatever
  // exists rather than returning nothing.
  if (intent.mode === "highlights") {
    const visual = candidates.filter((c) => lookup.assetOfSegment(c.segment.id)?.kind === "video");
    if (visual.length > 0) candidates = visual;
  }
  if (candidates.length === 0) throw new Error("no segments match the intent's filters.");

  const useLocal = isLocalLlm(providers);
  const edl = useLocal
    ? planLocal(candidates, intent, lookup)
    : await planModel(candidates, intent, lookup, providers);

  const res = validateEdl(edl, lookup);
  if (!res.ok) throw new Error(`orchestrate produced an invalid EDL: ${res.error}`);
  return { edl: res.edl, candidateCount: candidates.length, planner: useLocal ? "local-heuristic" : providers.selected.llm };
}
