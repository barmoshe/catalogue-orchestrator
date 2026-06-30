import type { Providers, ProviderKind } from "./types";
import { LocalTranscription } from "./transcription/local";
import { OpenAITranscription } from "./transcription/openai";
import { LocalVision } from "./vision/local";
import { OpenAIVision } from "./vision/openai";
import { LocalEmbeddings } from "./embeddings/local";
import { OpenAIEmbeddings } from "./embeddings/openai";
import { LocalLlm } from "./llm/local";
import { AnthropicLlm } from "./llm/anthropic";

export * from "./types";

/**
 * Select the provider bundle from env. The design's core move (see CLAUDE.md): a
 * deterministic `local` tier means the WHOLE pipeline runs + renders with NO keys, and
 * the same interfaces swap to real models the moment keys appear in `.env`.
 *
 *   LLM_PROVIDER = local | anthropic | openai | auto
 *     local  -> deterministic, no network (default when no keys)
 *     auto   -> prefer real where a key exists, fall back to local per-seam
 *
 * Each seam degrades independently: e.g. with only OPENAI_API_KEY set, transcription +
 * vision + embeddings go real while the LLM falls back to the local heuristic planner.
 */
export function getProviders(env: NodeJS.ProcessEnv = process.env): Providers {
  const kind = normalizeKind(env.LLM_PROVIDER);
  const openaiKey = env.OPENAI_API_KEY?.trim() || "";
  const anthropicKey = env.ANTHROPIC_API_KEY?.trim() || "";

  const wantReal = (seamKey: string) =>
    kind === "auto" ? Boolean(seamKey) : kind !== "local" && Boolean(seamKey);

  const transcription =
    wantReal(openaiKey) ? new OpenAITranscription(openaiKey) : new LocalTranscription();
  const vision = wantReal(openaiKey) ? new OpenAIVision(openaiKey) : new LocalVision();
  const embeddings =
    wantReal(openaiKey) ? new OpenAIEmbeddings(openaiKey) : new LocalEmbeddings();

  // LLM: explicit pin honored; otherwise prefer anthropic, then openai-compatible, else local.
  let llm;
  if (kind === "anthropic" && anthropicKey) llm = new AnthropicLlm(anthropicKey);
  else if (kind === "auto" && anthropicKey) llm = new AnthropicLlm(anthropicKey);
  else if (kind !== "local" && anthropicKey) llm = new AnthropicLlm(anthropicKey);
  else llm = new LocalLlm();

  return {
    transcription,
    vision,
    embeddings,
    llm,
    selected: {
      transcription: transcription.name,
      vision: vision.name,
      embeddings: embeddings.name,
      llm: llm.name,
    },
  };
}

/** True when the active LLM is the deterministic heuristic (route to planLocal). */
export function isLocalLlm(p: Providers): boolean {
  return p.selected.llm === "local-heuristic";
}

function normalizeKind(v: string | undefined): ProviderKind {
  const s = (v ?? "").toLowerCase();
  if (s === "anthropic" || s === "openai" || s === "auto") return s;
  return "local";
}
