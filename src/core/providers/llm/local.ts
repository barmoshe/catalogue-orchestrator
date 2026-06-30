import type { LlmProvider } from "../types.js";

/**
 * The `local` LLM tier does NOT do generic JSON completion — instead the orchestrator
 * detects a local provider (by `name`) and routes to a deterministic heuristic planner
 * that builds the EDL directly from retrieval scores + intent (see
 * orchestrate/planLocal). This class exists so the provider bundle is type-complete; if
 * something calls completeJson on it, that's a routing bug, so we fail loudly.
 */
export class LocalLlm implements LlmProvider {
  readonly name = "local-heuristic";
  async completeJson<T>(): Promise<T> {
    throw new Error(
      "LocalLlm.completeJson called: the local tier uses the heuristic planner, not generic JSON completion. Route on providers.selected.llm === 'local-heuristic'.",
    );
  }
}
