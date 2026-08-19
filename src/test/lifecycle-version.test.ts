import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension version [AC-34]", () => {
  it("reports package version 0.2.8 as the WXT manifest authority", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };
    expect(pkg.version).toBe("0.2.8");
  });
});
