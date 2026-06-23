import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "../utils/concurrency";

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of settle order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      // Earlier items resolve slower so order is not settle-order.
      await tick(20 - n * 2);
      return n * 2;
    });

    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("never runs more than `limit` mappers at once", async () => {
    let active = 0;
    let maxActive = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (i) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await tick();
      active -= 1;
      return i;
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("returns an empty array for empty input", async () => {
    const out = await mapWithConcurrency([], 4, async (x) => x);
    expect(out).toEqual([]);
  });

  it("clamps a non-positive limit to 1 (fully sequential)", async () => {
    let active = 0;
    let maxActive = 0;

    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await tick();
      active -= 1;
      return n;
    });

    expect(maxActive).toBe(1);
  });

  it("rejects when a mapper rejects", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) {
          throw new Error("boom");
        }
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
