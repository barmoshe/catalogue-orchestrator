import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * sha256 of a file's bytes — the content hash that becomes an AssetCard id and makes
 * re-ingest idempotent (same bytes -> same id -> cache hit). Streamed so large media
 * files don't load into memory.
 */
export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const s = createReadStream(path);
    s.on("error", reject);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve(h.digest("hex")));
  });
}

/** Short, stable hash of a string (for cache keys that aren't file bytes). */
export function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
