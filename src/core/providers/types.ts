import type { z } from "zod";

/** A transcript window with timing. Mirrors Whisper `verbose_json` segments. */
export type TranscriptSegment = { start: number; end: number; text: string };
export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
  duration: number | null;
};

export interface TranscriptionProvider {
  readonly name: string;
  /** Transcribe an audio/video file. Empty result is valid (no speech). */
  transcribe(filePath: string, opts?: { language?: string }): Promise<TranscriptResult>;
}

export interface VisionProvider {
  readonly name: string;
  /** One-line caption of a representative frame image. */
  caption(imagePath: string, hint?: { context?: string }): Promise<string>;
}

export interface EmbeddingsProvider {
  readonly name: string;
  readonly dim: number;
  /** Embed a batch of strings into fixed-length vectors. */
  embed(texts: string[]): Promise<number[][]>;
}

export interface LlmProvider {
  readonly name: string;
  /**
   * Force the model to return JSON matching `schema`. Implementations validate with
   * `schema.safeParse` and re-prompt on failure. The caller never sees raw text.
   */
  completeJson<T>(args: {
    schema: z.ZodType<T>;
    schemaName: string;
    schemaDescription?: string;
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<T>;
}

export type ProviderKind = "local" | "anthropic" | "openai" | "auto";

export interface Providers {
  transcription: TranscriptionProvider;
  vision: VisionProvider;
  embeddings: EmbeddingsProvider;
  llm: LlmProvider;
  /** Which concrete impls were selected, for logging/telemetry. */
  selected: Record<"transcription" | "vision" | "embeddings" | "llm", string>;
}
