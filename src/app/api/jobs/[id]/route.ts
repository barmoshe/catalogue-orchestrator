import { getJob } from "@/core/jobs/store";
import { recoverPending } from "@/core/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a render job's status. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await recoverPending();
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    id: job.id,
    status: job.status,
    title: job.title,
    mode: job.mode,
    progress: job.progress,
    stage: job.stage,
    width: job.width,
    height: job.height,
    durationSec: job.durationSec,
    error: job.error,
    videoUrl: job.status === "completed" ? `/api/jobs/${job.id}/video` : null,
  });
}
