import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCatalogue } from "@/core/ingest/persist";
import { keyframeDir } from "@/core/ingest/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a segment's keyframe image. Path is resolved from the catalogue and confined
 * to the keyframes dir (no traversal). */
export async function GET(req: Request) {
  const seg = new URL(req.url).searchParams.get("seg");
  if (!seg) return new Response("missing seg", { status: 400 });
  const cat = await loadCatalogue();
  const card = cat.segments.find((s) => s.id === seg);
  if (!card?.keyframePath) return new Response("not found", { status: 404 });

  const safeRoot = resolve(keyframeDir());
  const full = resolve(card.keyframePath);
  if (!full.startsWith(safeRoot)) return new Response("forbidden", { status: 403 });
  try {
    const buf = await readFile(full);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/jpeg", "cache-control": "no-store" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
