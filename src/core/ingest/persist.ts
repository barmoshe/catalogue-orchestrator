import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { AssetCard, SegmentCard, type Catalogue } from "../schema/cards.js";
import { z } from "zod";

/** One persisted unit: an asset plus its segments, stored at cards/<hash>.json. */
export const StoredEntry = z.object({ asset: AssetCard, segments: z.array(SegmentCard) });
export type StoredEntry = z.infer<typeof StoredEntry>;

export function catalogueDir(env: NodeJS.ProcessEnv = process.env): string {
  const d = env.CATALOGUE_DIR || ".catalogue";
  return isAbsolute(d) ? d : resolve(process.cwd(), d);
}
export function cardsDir(env?: NodeJS.ProcessEnv): string {
  return join(catalogueDir(env), "cards");
}
export function keyframeDir(env?: NodeJS.ProcessEnv): string {
  return join(catalogueDir(env), "keyframes");
}
function cardPath(hash: string, env?: NodeJS.ProcessEnv): string {
  return join(cardsDir(env), `${hash}.json`);
}

/** True when an asset with this content hash is already ingested (cache hit). */
export function hasEntry(hash: string, env?: NodeJS.ProcessEnv): boolean {
  return existsSync(cardPath(hash, env));
}

export async function writeEntry(entry: StoredEntry, env?: NodeJS.ProcessEnv): Promise<void> {
  await mkdir(cardsDir(env), { recursive: true });
  const json = JSON.stringify(StoredEntry.parse(entry), null, 2);
  await writeFile(cardPath(entry.asset.id, env), json, "utf8");
}

export async function readEntry(hash: string, env?: NodeJS.ProcessEnv): Promise<StoredEntry | null> {
  const p = cardPath(hash, env);
  if (!existsSync(p)) return null;
  return StoredEntry.parse(JSON.parse(await readFile(p, "utf8")));
}

/** Load the whole catalogue (every stored entry) flattened for indexing/retrieval. */
export async function loadCatalogue(env?: NodeJS.ProcessEnv): Promise<Catalogue> {
  const dir = cardsDir(env);
  if (!existsSync(dir)) return { assets: [], segments: [] };
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const assets = [];
  const segments = [];
  for (const f of files) {
    const entry = StoredEntry.parse(JSON.parse(await readFile(join(dir, f), "utf8")));
    assets.push(entry.asset);
    segments.push(...entry.segments);
  }
  return { assets, segments };
}
