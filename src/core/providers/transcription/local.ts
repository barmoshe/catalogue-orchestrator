import type { TranscriptionProvider, TranscriptResult } from "../types";

/**
 * Deterministic, no-network transcription stub. It never invents speech: it returns an
 * empty transcript (the honest default for media with no known speech). The real
 * Whisper provider swaps in when OPENAI_API_KEY is set. Keeping this empty means the
 * `local` tier produces correct, non-hallucinated cards offline.
 */
export class LocalTranscription implements TranscriptionProvider {
  readonly name = "local-none";
  async transcribe(): Promise<TranscriptResult> {
    return { text: "", segments: [], duration: null };
  }
}
