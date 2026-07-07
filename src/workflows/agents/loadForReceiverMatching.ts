// Shared agent-catalog loader for CRM username receiver matching during lead
// sync. Used by the popup sync actions and the background auto-sync runner so
// both paths always attempt matching before PATCHing leads.
import { listAgents, type Agent } from "../../api/agents";

export type AgentCatalogCache = {
  items: Agent[];
  loaded: boolean;
  loading?: boolean;
  error?: string;
};

export async function loadAgentsForReceiverMatching(): Promise<Agent[]> {
  try {
    return await listAgents({ includeInactive: true });
  } catch (err) {
    console.warn(
      "[Granot Sync] Could not load Agents for CRM username receiver matching.",
      err,
    );
    return [];
  }
}

/**
 * Returns a cached agent list when available, otherwise loads the catalog and
 * updates the optional popup cache. Retries when the cache is empty so a failed
 * first load during a scan does not disable receiver matching for the rest of
 * the auto-sync cycle.
 */
export async function resolveAgentsForReceiverMatching(
  cache?: AgentCatalogCache,
): Promise<Agent[]> {
  if (cache?.loaded && cache.items.length > 0) {
    return cache.items;
  }

  if (cache) {
    cache.loading = true;
    cache.error = undefined;
  }

  const items = await loadAgentsForReceiverMatching();
  if (cache) {
    cache.items = items;
    cache.loaded = true;
    cache.loading = false;
    if (items.length === 0) {
      cache.error = "Agent catalog is empty — receiver matching skipped.";
    } else {
      cache.error = undefined;
    }
  }

  return items;
}
