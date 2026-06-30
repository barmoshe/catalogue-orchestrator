import { stat, open } from "node:fs/promises";
import { existsSync } from "node:fs";
import { outputPathFor } from "@/core/jobs/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stream a finished render as video/mp4, honouring Range requests for in-browser seeking. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{16,}$/i.test(id)) return new Response("bad id", { status: 400 });
  const path = outputPathFor(id);
  if (!existsSync(path)) return new Response("not found", { status: 404 });

  const { size } = await stat(path);
  const range = req.headers.get("range");
  const fh = await open(path, "r");

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    const chunk = end - start + 1;
    const buf = Buffer.alloc(chunk);
    await fh.read(buf, 0, chunk, start);
    await fh.close();
    return new Response(new Uint8Array(buf), {
      status: 206,
      headers: {
        "content-type": "video/mp4",
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "content-length": String(chunk),
        "cache-control": "no-store",
      },
    });
  }

  const buf = await fh.readFile();
  await fh.close();
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": String(size), "cache-control": "no-store" },
  });
}
