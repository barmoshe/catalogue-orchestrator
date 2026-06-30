import { createReadStream } from "node:fs";
import OpenAI from "openai";
import type { TranscriptionProvider, TranscriptResult } from "../types";

/**
 * OpenAI Whisper transcription. Follows the weatherv1-next request shape:
 * `audio.transcriptions.create` with `response_format: "verbose_json"` for segment
 * timings. Model id from WHISPER_MODEL (default `whisper-1`). Key: OPENAI_API_KEY.
 */
export class OpenAITranscription implements TranscriptionProvider {
  readonly name = "openai-whisper";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = process.env.WHISPER_MODEL || "whisper-1") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async transcribe(filePath: string, opts?: { language?: string }): Promise<TranscriptResult> {
    const res = await this.client.audio.transcriptions.create({
      model: this.model,
      file: createReadStream(filePath),
      response_format: "verbose_json",
      ...(opts?.language ? { language: opts.language } : {}),
    });
    // verbose_json includes `segments` and `duration`; the SDK types are loose here.
    const r = res as unknown as {
      text?: string;
      duration?: number;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    return {
      text: (r.text ?? "").trim(),
      segments: (r.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      })),
      duration: r.duration ?? null,
    };
  }
}
