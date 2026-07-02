// Pure matching logic for the Sales Rep attribution flow. No DOM / messaging /
// network — takes an already-fetched agent list and a raw Granot value.
import type { Agent } from "../../api/agents";

export type AgentMatchResult = {
  status: "single" | "multiple" | "none";
  candidates: Agent[];
};

export type CrmUsernameAgentMatchResult =
  | {
      status: "single";
      username: string;
      candidate: Agent;
    }
  | {
      status: "none";
      username?: string;
    };

export function normalizeGranotCrmUsername(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

export function matchAgentByCrmUsername(
  rawValue: string | undefined,
  agents: Agent[],
): CrmUsernameAgentMatchResult {
  const username = normalizeGranotCrmUsername(rawValue);
  if (!username) {
    return { status: "none" };
  }

  const candidate = agents.find(
    (agent) => normalizeGranotCrmUsername(agent.granot_crm_username) === username,
  );
  return candidate
    ? { status: "single", username, candidate }
    : { status: "none", username };
}

/**
 * Case-insensitive match of `rawValue` (Granot's `user`/`rep` column text)
 * against the first whitespace-delimited token of each agent's `name` (e.g.
 * "Nick Smith" -> "nick"). Inactive agents are included as eligible
 * candidates per the interview decision — the owner wants to be able to link
 * a lead to any agent, active or not, and fix up `active` separately.
 */
export function matchAgentsByFirstName(
  rawValue: string,
  agents: Agent[],
): AgentMatchResult {
  const needle = rawValue.trim().toLowerCase();
  const candidates = needle
    ? agents.filter((agent) => firstToken(agent.name) === needle)
    : [];

  return {
    status: candidates.length === 1 ? "single" : candidates.length > 1 ? "multiple" : "none",
    candidates,
  };
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}
