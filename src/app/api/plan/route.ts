import { orchestrate } from "@/core/orchestrate/orchestrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST an intent → a validated EDL (auto-edit). Body = the Intent shape. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { edl, planner, candidateCount } = await orchestrate(body);
    return Response.json({ edl, planner, candidateCount });
  } catch (err) {
    console.error("[/api/plan]", err);
    // Local-first tool: the message goes to the local operator. For a hosted deploy,
    // genericize this (it can carry zod/ffmpeg internals).
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
