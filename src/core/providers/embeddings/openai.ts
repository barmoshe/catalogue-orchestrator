import OpenAI from "openai";
import type { EmbeddingsProvider } from "../types";

/**
 * OpenAI text embeddings. Model from OPENAI_EMBED_MODEL (default
 * `text-embedding-3-small`, 1536 dims). Key: OPENAI_API_KEY.
 */
export class OpenAIEmbeddings implements EmbeddingsProvider {
  readonly name = "openai-embed";
  readonly dim: number;
  private client: OpenAI;
  private model: string;

  constructor(
    apiKey: string,
    model = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small",
    dim = 1536,
  ) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return res.data.map((d) => d.embedding as number[]);
  }
}
