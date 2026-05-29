// Vitest setup. The pure-helper modules under test do not touch the
// `browser` extension API at runtime (they only import types from
// `utils/api`), so no WebExtension shim is required yet. This file exists
// as a stable seam for future tests (e.g. parser tests in Unit 03) that may
// need DOM helpers or browser globals.
export {};
