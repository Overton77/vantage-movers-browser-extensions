// Public surface of the Vantage API client. Domain endpoint modules are split
// by resource; this barrel re-exports them so callers can import from a single
// `api` entrypoint. `utils/api.ts` re-exports this barrel for backward
// compatibility with existing import paths.
export * from "./client";
export * from "./health";
export * from "./formLeads";
export * from "./callLeads";
