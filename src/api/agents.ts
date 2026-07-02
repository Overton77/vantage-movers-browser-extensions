// Agent catalog + receiver-agent linking endpoints, backing the Sales Rep
// attribution flow. Reuses the existing owner-only catalog CRUD routes
// (`/api/v1/admin/catalog/agents`, `/api/v1/admin/agents`) and extends the
// existing lead PATCH routes with `receiver_agent` — see the build plan's
// "Endpoint reuse" decision for why no new batch API was added.
import { vantageFetch } from "./client";

/** Mirrors `CatalogItem` in `api/services/catalog/catalog.service.ts`. */
export type Agent = {
  id: string;
  _id: string;
  name: string;
  normalized_name: string;
  active: boolean;
  created_from: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateAgentInput = {
  name: string;
  role?: string;
  active?: boolean;
  /**
   * Provenance override. Pass `"extension_sales_rep_match"` when creating an
   * agent from the Sales Rep create/edit dialog so it's distinguishable from
   * agents created in the admin panel (`"admin"`, the server-side default).
   */
  created_from?: string;
};

export type UpdateAgentInput = {
  name?: string;
  role?: string;
  active?: boolean;
};

export async function listAgents(
  options: { includeInactive?: boolean } = {},
): Promise<Agent[]> {
  const qs = options.includeInactive ? "?include_inactive=true" : "";
  const envelope = await vantageFetch<{ items: Agent[] }>(
    `/api/v1/admin/catalog/agents${qs}`,
    { method: "GET" },
  );

  return envelope.data.items;
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const envelope = await vantageFetch<Agent>(`/api/v1/admin/agents`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  return envelope.data;
}

export async function updateAgent(
  id: string,
  input: UpdateAgentInput,
): Promise<Agent> {
  const envelope = await vantageFetch<Agent>(`/api/v1/admin/agents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return envelope.data;
}

/** How a lead's `receiver_agent` attribution was made. Mirrors the server-side enum. */
export type ReceiverAgentSource =
  | "extension_match"
  | "extension_selected"
  | "extension_created"
  | "manual";

export type LinkReceiverAgentInput = {
  receiver_agent: string;
  receiver_agent_source: ReceiverAgentSource;
  /** Raw Granot `user`/`rep` column text, kept for auditing later mismatches. */
  receiver_agent_source_value?: string;
};

export type LinkReceiverAgentResult = {
  _id: string;
  receiver_agent_name_snapshot?: string;
};

export async function linkReceiverAgent(
  leadKind: "call" | "form",
  leadId: string,
  input: LinkReceiverAgentInput,
): Promise<LinkReceiverAgentResult> {
  const path =
    leadKind === "call"
      ? `/api/v1/call-leads/${leadId}`
      : `/api/v1/form-leads/${leadId}`;
  const envelope = await vantageFetch<LinkReceiverAgentResult>(path, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

  return envelope.data;
}
