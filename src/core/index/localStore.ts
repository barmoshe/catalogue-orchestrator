import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { SegmentCard } from "../schema/cards";
import { z } from "zod";
import { tokenize } from "../providers/embeddings/local";
import { catalogueDir } from "../ingest/persist";
import { cosine, passesFilter, type ScoredSegment, type StructuredFilter, type VectorStore } from "./store";

const IndexItem = z.object({ segment: SegmentCard, vector: z.array(z.number()) });
const IndexFile = z.object({ dim: z.number(), items: z.array(IndexItem) });
type IndexItem = z.infer<typeof IndexItem>;

/**
 * Dependency-free vector store: brute-force cosine for semantic search and a lightweight
 * tf scorer for keyword search, over vectors persisted as JSON. Ideal for local-first
 * catalogues (no native module, fully deterministic, trivially testable). Implements the
 * same VectorStore contract LanceDB would, so swapping is a one-file change.
 */
export class LocalVectorStore implements VectorStore {
  private items: IndexItem[] = [];
  private loaded = false;
  constructor(private path: string) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): LocalVectorStore {
    return new LocalVectorStore(join(catalogueDir(env), "index.json"));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    if (existsSync(this.path)) {
      try {
        const parsed = IndexFile.parse(JSON.parse(await readFile(this.path, "utf8")));
        this.items = parsed.items;
      } catch {
        // A truncated/corrupt index must not brick every search — start empty and let
        // the next `co index` rebuild it rather than throwing on every call.
        this.items = [];
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const dim = this.items[0]?.vector.length ?? 0;
    // Atomic write: a crash mid-write can't truncate the live index.
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify({ dim, items: this.items }, null, 2), "utf8");
    await rename(tmp, this.path);
  }

  async upsert(items: Array<{ segment: SegmentCard; vector: number[] }>): Promise<void> {
    await this.load();
    const byId = new Map(this.items.map((it) => [it.segment.id, it]));
    for (const it of items) byId.set(it.segment.id, it);
    this.items = [...byId.values()];
    await this.persist();
  }

  async search(queryVec: number[], filter: StructuredFilter, k: number): Promise<ScoredSegment[]> {
    await this.load();
    return this.items
      .filter((it) => passesFilter(it.segment, filter))
      .map((it) => ({ segment: it.segment, score: cosine(queryVec, it.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async keyword(text: string, filter: StructuredFilter, k: number): Promise<ScoredSegment[]> {
    await this.load();
    const q = new Set(tokenize(text));
    if (q.size === 0) return [];
    return this.items
      .filter((it) => passesFilter(it.segment, filter))
      .map((it) => {
        const toks = tokenize(it.segment.embeddingText);
        let hits = 0;
        for (const t of toks) if (q.has(t)) hits += 1;
        // tf normalized by sqrt(length) — favours dense matches without over-rewarding long text
        const score = toks.length ? hits / Math.sqrt(toks.length) : 0;
        return { segment: it.segment, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async all(): Promise<SegmentCard[]> {
    await this.load();
    return this.items.map((it) => it.segment);
  }

  async size(): Promise<number> {
    await this.load();
    return this.items.length;
  }
}
