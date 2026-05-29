// Compatibility barrel. The Vantage API client was split into domain modules
// under `src/api/*` in Unit 04. Existing imports from `utils/api` continue to
// work via this re-export; later units can import from `src/api/*` directly.
export * from "../api";
