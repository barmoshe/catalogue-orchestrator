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

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "ingest":
      return cmdIngest(rest);
    case "list":
      return cmdList();
    case "plan":
    case "render":
      console.error(`'${cmd}' lands in a later phase (orchestrate/compile).`);
      process.exit(2);
      break;
    default:
      console.error("usage: co <ingest|list|plan|render> [args]");
      process.exit(2);
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
