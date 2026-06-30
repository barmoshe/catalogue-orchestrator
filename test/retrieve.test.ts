import { describe, it, expect } from "vitest";
import type { SegmentCard } from "../src/core/schema/cards.js";
import { LocalEmbeddings } from "../src/core/providers/embeddings/local.js";
import { LocalVectorStore } from "../src/core/index/localStore.js";
import { retrieve } from "../src/core/retrieve/retrieve.js";
import { reciprocalRankFusion, passesFilter } from "../src/core/index/store.js";

function seg(id: string, text: string, over: Partial<SegmentCard> = {}): SegmentCard {
  return {
    id, assetId: id.split(":")[0], index: 0, startSec: 0, endSec: 5,
    transcript: null, caption: text, keyframePath: null, tags: [],
    shotType: "unknown", motion: 0.3, audioEnergy: 0.3, speechRatio: 0, salience: 0.4,
    embeddingText: text, ...over,
  };
}

const SEGMENTS = [
  seg("a:0", "a dog runs across a sunny beach with waves"),
  seg("a:1", "a city street at night with neon signs and rain"),
  seg("b:0", "a chef plates a colorful salad in a bright kitchen"),
  seg("b:1", "a dog sleeps on a couch in a living room"),
];

async function makeStore(): Promise<LocalVectorStore> {
  const store = new LocalVectorStore("/tmp/co-test-index-DOES-NOT-PERSIST.json");
  const embed = new LocalEmbeddings();
  const vecs = await embed.embed(SEGMENTS.map((s) => s.embeddingText));
  // upsert without persisting to disk: call the in-memory path then clear the file write
  await store.upsert(SEGMENTS.map((s, i) => ({ segment: s, vector: vecs[i] })));
  return store;
}

describe("retrieve (hybrid RAG, local tier)", () => {
  it("ranks lexically-relevant segments first", async () => {
    const store = await makeStore();
    const res = await retrieve({ query: "dog on the beach", k: 3, store, providers: providersLocal() });
    expect(res.length).toBeGreaterThan(0);
    // the beach-dog segment should outrank the city-street one
    expect(res[0].segment.id).toBe("a:0");
    const ids = res.map((r) => r.segment.id);
    expect(ids.indexOf("a:0")).toBeLessThan(ids.indexOf("a:1") === -1 ? Infinity : ids.indexOf("a:1"));
  });

  it("applies structured filters (assetId)", async () => {
    const store = await makeStore();
    const res = await retrieve({ query: "dog", k: 5, store, providers: providersLocal(), filter: { assetId: "b" } });
    expect(res.every((r) => r.segment.assetId === "b")).toBe(true);
  });
});

describe("store helpers", () => {
  it("passesFilter respects duration + salience + speech", () => {
    const s = seg("x:0", "t", { startSec: 0, endSec: 3, salience: 0.5, speechRatio: 0.5 });
    expect(passesFilter(s, { minDurationSec: 2, maxDurationSec: 4 })).toBe(true);
    expect(passesFilter(s, { minDurationSec: 4 })).toBe(false);
    expect(passesFilter(s, { minSalience: 0.6 })).toBe(false);
    expect(passesFilter(s, { hasSpeech: true })).toBe(true);
  });

  it("reciprocalRankFusion merges and dedupes by id", () => {
    const A = [{ segment: SEGMENTS[0], score: 1 }, { segment: SEGMENTS[1], score: 0.5 }];
    const B = [{ segment: SEGMENTS[1], score: 1 }, { segment: SEGMENTS[0], score: 0.5 }];
    const fused = reciprocalRankFusion([A, B], 10);
    expect(fused.length).toBe(2);
    expect(new Set(fused.map((f) => f.segment.id)).size).toBe(2);
  });
});

// a Providers stub exposing only the embeddings seam retrieve() uses
function providersLocal() {
  const embeddings = new LocalEmbeddings();
  return {
    embeddings,
    transcription: { name: "x", transcribe: async () => ({ text: "", segments: [], duration: null }) },
    vision: { name: "x", caption: async () => "" },
    llm: { name: "x", completeJson: async () => ({}) as never },
    selected: { transcription: "x", vision: "x", embeddings: embeddings.name, llm: "x" },
  };
}
