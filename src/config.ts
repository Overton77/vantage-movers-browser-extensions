/** Granot CRM URL patterns the content script runs on. Add your instance here. */
export const GRANOT_URL_PATTERNS = [
  '*://eagle.hellomoving.com/*',
  '*://*.granot.com/*',
  '*://*.granot.co.il/*',
  // Local dev / staging — remove or adjust as needed
  'http://localhost/*',
] as const;

/** Vantage API base URL */
export const VANTAGE_API_BASE =
  import.meta.env.VITE_VANTAGE_API_BASE ??
  'https://vantage-movers-main-server.vercel.app';

/** Required for protected /api/v1 routes. Set only for local extension testing. */
export const VANTAGE_API_SECRET = import.meta.env.VITE_VANTAGE_API_SECRET ?? '';

export const LOG_PREFIX = '[Granot Sync]';
