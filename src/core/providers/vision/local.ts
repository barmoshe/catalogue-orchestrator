import { basename, extname } from "node:path";
import type { VisionProvider } from "../types";

/**
 * Deterministic, no-network caption stub. It derives a plain, honest descriptor from
 * the keyframe filename + any context passed by the ingester (asset name, time range),
 * rather than inventing visual content it cannot see. Good enough for offline RAG +
 * demo; the real vision provider swaps in when a key is present.
 */
export class LocalVision implements VisionProvider {
  readonly name = "local-stub";
  async caption(imagePath: string, hint?: { context?: string }): Promise<string> {
    const stem = basename(imagePath, extname(imagePath)).replace(/[-_]+/g, " ").trim();
    const ctx = hint?.context?.trim();
    if (ctx) return `Frame from ${ctx}`;
    return stem ? `Frame: ${stem}` : "Representative frame";
  }
}
