import { createHash } from "node:crypto";
import type { EmbeddingsProvider } from "../types.js";

/**
 * Deterministic, no-network embedding: a hashed bag-of-words vector. Each token is
 * hashed into `dim` buckets (signed), then the vector is L2-normalized so cosine
 * similarity is meaningful. Stable across runs (good for tests + offline demo) and
 * captures real lexical overlap — enough for the RAG ranking to be sensible without
 * a model. The real semantic provider swaps in when a key is present.
 */
export class LocalEmbeddings implements EmbeddingsProvider {
  readonly name = "local-hash";
  readonly dim: number;

  constructor(dim = 256) {
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Array<number>(this.dim).fill(0);
    const tokens = tokenize(text);
    for (const tok of tokens) {
      const h = createHash("sha1").update(tok).digest();
      const bucket = h.readUInt32BE(0) % this.dim;
      const sign = (h[4] & 1) === 0 ? 1 : -1;
      vec[bucket] += sign;
    }
    // L2 normalize
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    return vec.map((v) => v / norm);
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}
