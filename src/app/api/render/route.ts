import { EDL } from "@/core/schema/edl";
import { enqueueRender } from "@/core/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { edl } → enqueue a render, return the job id. The UI polls /api/jobs/[id]. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const edl = EDL.parse(body.edl ?? body);
    const job = await enqueueRender(edl);
    return Response.json({ jobId: job.id, status: job.status });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
