import { defineConfig } from "vitest/config";

// Tests and the modules they import use relative paths, so no module aliases
// are required here. Keep this config dependency-free (no node:* imports) so it
// type-checks under the extension's bundler-oriented tsconfig.
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/test/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
});
