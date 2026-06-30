/**
 * `co` — drive the engine headless, no UI.
 *   co ingest <dir> [--force]   ingest a media folder into catalogue cards
 *   co list                     list the current catalogue
 *   co plan <intent.json>       (Phase 3) author an EDL
 *   co render <edl.json>        (Phase 4) compile an EDL -> MP4
 *
 * Run via `npm run co -- ingest <dir>`.
 */
import { ingestDir } from "../src/core/ingest/ingest.js";
import { loadCatalogue } from "../src/core/ingest/persist.js";
import { getProviders } from "../src/core/providers/index.js";
import { buildIndex, getStore } from "../src/core/index/embed.js";
import { retrieve } from "../src/core/retrieve/retrieve.js";
import { orchestrate } from "../src/core/orchestrate/orchestrate.js";
import { writeFileSync } from "node:fs";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "ingest":
      return cmdIngest(rest);
    case "list":
      return cmdList();
    case "index":
      return cmdIndex();
    case "search":
      return cmdSearch(rest);
    case "plan":
      return cmdPlan(rest);
    case "render":
      console.error("'render' lands in Phase 4 (compile).");
      process.exit(2);
      break;
    default:
      console.error("usage: co <ingest|list|index|search|plan|render> [args]");
      process.exit(2);
  }
}

async function cmdPlan(args: string[]) {
  // co plan [highlights|assembly] [query...] [--aspect 9:16] [--max 30] [--asset <id>] [--out edl.json] [--feedback "..."]
  const mode = args[0] === "assembly" ? "assembly" : "highlights";
  const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const flags = new Set(["--aspect", "--max", "--asset", "--out", "--feedback"]);
  const query = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && !flags.has(arr[i - 1])).join(" ");
  const intent = {
    mode,
    query,
    aspect: (opt("--aspect") as "9:16" | "1:1" | "16:9") || "9:16",
    maxDurationSec: opt("--max") ? Number(opt("--max")) : 30,
    assetId: opt("--asset"),
    feedback: opt("--feedback"),
  };
  const { edl, candidateCount, planner } = await orchestrate(intent);
  console.log(`planner=${planner}  candidates=${candidateCount}  clips=${edl.clips.length}  target=${edl.target.aspect} ${edl.target.width}x${edl.target.height}`);
  console.log(`rationale: ${edl.rationale}`);
  const out = opt("--out");
  if (out) { writeFileSync(out, JSON.stringify(edl, null, 2)); console.log(`wrote ${out}`); }
  else console.log(JSON.stringify(edl, null, 2));
}

async function cmdIndex() {
  const providers = getProviders();
  console.log(`embeddings: ${providers.selected.embeddings}`);
  const n = await buildIndex({ providers });
  console.log(`indexed ${n} segments`);
}

async function cmdSearch(args: string[]) {
  const query = args.filter((a) => !a.startsWith("--")).join(" ");
  if (!query) { console.error("usage: co search <query>"); process.exit(2); }
  const store = getStore();
  if ((await store.size()) === 0) { console.error("index empty — run `co index` first."); process.exit(2); }
  const results = await retrieve({ query, k: 8, store });
  console.log(`top ${results.length} for "${query}":`);
  for (const r of results) {
    const s = r.segment;
    console.log(`  ${r.score.toFixed(4)}  ${s.id.slice(0, 10)}…  ${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s  ${JSON.stringify(s.tags)}  ${(s.caption ?? s.transcript ?? "").slice(0, 50)}`);
  }
}

async function cmdIngest(args: string[]) {
  const force = args.includes("--force");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("usage: co ingest <dir> [--force]");
    process.exit(2);
  }
  const providers = getProviders();
  console.log(`providers: ${JSON.stringify(providers.selected)}`);
  const t0 = Date.now();
  const entries = await ingestDir(dir, {
    force,
    onEvent: (e) => {
      if (e.type === "asset-cache-hit") console.log(`  cache-hit  ${rel(e.path)}`);
      else if (e.type === "asset-done") console.log(`  ingested   ${rel(e.path)}  (${e.segments} segments)`);
      else if (e.type === "asset-error") console.log(`  ERROR      ${rel(e.path)}: ${e.error}`);
    },
  });
  const segs = entries.reduce((n, e) => n + e.segments.length, 0);
  console.log(`\ndone: ${entries.length} assets, ${segs} segments in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function cmdList() {
  const cat = await loadCatalogue();
  console.log(`catalogue: ${cat.assets.length} assets, ${cat.segments.length} segments`);
  for (const a of cat.assets) {
    console.log(`  ${a.id.slice(0, 10)}  ${a.kind.padEnd(5)}  ${(a.durationSec ?? 0).toFixed(1).padStart(6)}s  ${a.segmentIds.length} seg  ${rel(a.path)}`);
  }
}

function rel(p: string): string {
  return p.replace(process.cwd() + "/", "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
