import { loadCatalogue } from "@/core/ingest/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The catalogue for the browser: assets + segments, with keyframe URLs for the grid. */
export async function GET() {
  const cat = await loadCatalogue();
  const segments = cat.segments.map((s) => ({
    id: s.id,
    assetId: s.assetId,
    startSec: s.startSec,
    endSec: s.endSec,
    caption: s.caption,
    transcript: s.transcript,
    tags: s.tags,
    salience: s.salience,
    motion: s.motion,
    speechRatio: s.speechRatio,
    keyframeUrl: s.keyframePath ? `/api/keyframe?seg=${encodeURIComponent(s.id)}` : null,
  }));
  const assets = cat.assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    durationSec: a.durationSec,
    width: a.width,
    height: a.height,
    hasAudio: a.hasAudio,
    summary: a.summary,
    path: a.path.split("/").pop(),
    segmentIds: a.segmentIds,
  }));
  return Response.json({ assets, segments });
}
