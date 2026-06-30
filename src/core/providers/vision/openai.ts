import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import OpenAI from "openai";
import type { VisionProvider } from "../types.js";

/**
 * OpenAI vision caption over a scene-sampled keyframe (never per-frame — cost/latency).
 * Uses the chat completions image input. Model from OPENAI_MODEL (default `gpt-4o`).
 * Key: OPENAI_API_KEY.
 */
export class OpenAIVision implements VisionProvider {
  readonly name = "openai-vision";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = process.env.OPENAI_MODEL || "gpt-4o") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async caption(imagePath: string, hint?: { context?: string }): Promise<string> {
    const b64 = (await readFile(imagePath)).toString("base64");
    const mime = mimeOf(imagePath);
    const ctx = hint?.context ? ` Context: ${hint.context}.` : "";
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 120,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Caption this video frame in one concrete sentence: what is shown, the setting, and the apparent shot type.${ctx} No preamble.`,
            },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  }
}

function mimeOf(path: string): string {
  const e = extname(path).toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  return "image/jpeg";
}
