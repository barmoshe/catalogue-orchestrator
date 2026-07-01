import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { loadCatalogue, keyframeDir } from "@/core/ingest/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a segment's keyframe image. The path comes from the catalogue (not the
 * request) and is realpath-confined to the keyframes dir — no traversal, no symlink
 * escape, no prefix-sibling bypass. */
export async function GET(req: Request) {
  const seg = new URL(req.url).searchParams.get("seg");
  if (!seg) return new Response("missing seg", { status: 400 });
  const cat = await loadCatalogue();
  const card = cat.segments.find((s) => s.id === seg);
  if (!card?.keyframePath) return new Response("not found", { status: 404 });

  try {
    const safeRoot = await realpath(resolve(keyframeDir()));
    const full = await realpath(resolve(card.keyframePath));
    if (full !== safeRoot && !full.startsWith(safeRoot + sep)) {
      return new Response("forbidden", { status: 403 });
    }
    const buf = await readFile(full);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
