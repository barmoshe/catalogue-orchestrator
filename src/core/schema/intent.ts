import { z } from "zod";
import { Aspect } from "./edl.js";

/**
 * The user's request to the engine. Two modes share one shape; the orchestrator picks
 * the planner and which retrieval runs off `mode`.
 */
export const Intent = z.object({
  mode: z.enum(["highlights", "assembly"]),
  // highlights: the long asset to mine; assembly: optional, retrieve across catalogue
  query: z.string().default(""), // free-text brief / what to find
  aspect: Aspect.default("9:16"),
  maxDurationSec: z.number().positive().default(60),
  fps: z.number().positive().default(30),
  // highlights mode: restrict to one source asset
  assetId: z.string().optional(),
  // assembly mode: include a music bed if one is available
  wantMusic: z.boolean().default(false),
  // refine: the previous EDL + feedback to revise it
  previousEdl: z.unknown().optional(),
  feedback: z.string().optional(),
});
export type Intent = z.infer<typeof Intent>;
