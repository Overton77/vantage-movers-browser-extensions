// Vantage health ping. Extracted from `utils/api.ts` in Unit 04.
import { VANTAGE_API_BASE } from "../config";
import { error, log, warn } from "../utils/logger";

export type PingPayload = {
  source: "granot-sync-extension";
  pageUrl: string;
  timestamp: string;
  /** Placeholder — replace with real Granot fields as you discover them */
  sampleValue?: string;
};

/**
 * Sends a test payload to the Vantage server.
 * Wire up a real endpoint once you know which route to hit.
 */
export async function pingServer(payload: PingPayload): Promise<void> {
  const url = `${VANTAGE_API_BASE}/health`;

  log("Pinging server:", url, payload);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    log("Server response:", response.status, response.statusText);

    if (!response.ok) {
      warn("Non-OK response from server");
    }
  } catch (err) {
    error("Failed to reach server:", err);
    throw err;
  }
}
