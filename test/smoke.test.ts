import { describe, it, expect } from "vitest";

// Phase 0 smoke test: proves the vitest harness runs. Real coverage (schema,
// edlToFfmpeg->args, retrieve ranking, validate loop) lands in later phases.
describe("scaffold", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
