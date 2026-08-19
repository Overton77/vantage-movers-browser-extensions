// Form Lead API endpoints. Extracted from `utils/api.ts` in Unit 04.
import { vantageFetch } from "./client";

export type FormLeadLookup = {
  _id: string;
  ref_no?: string;
  source_company?: string;
  quoted?: boolean;
  cubic_feet?: number;
  pickup_city?: string;
  pickup_zip?: string;
  pickup_state?: string;
  delivery_city?: string;
  destination_zip?: string;
  delivery_state?: string;
  /** True when this submission was quarantined as a duplicate (not synced to CRM). */
  duplicate?: boolean;
  /**
   * Mongo ObjectId of an attached BookedLead, when the form lead has one.
   * Present when the form lead has been booked. The popup uses this to
   * show "This form lead has a booking attached".
   */
  booked?: string | null;
  receiver_agent?: string | null;
  /** Name snapshot of the agent already linked as `receiver_agent`, if any. */
  receiver_agent_name_snapshot?: string;
  receiver_agent_source?: string;
  receiver_agent_source_value?: string;
};

export type FormLeadUpdatePayload = {
  quoted?: boolean;
  cubic_feet?: number;
  pickup_city?: string;
  pickup_zip?: string;
  pickup_state?: string;
  delivery_city?: string;
  destination_zip?: string;
  delivery_state?: string;
  receiver_agent?: string;
  receiver_agent_source?: "extension_crm_username_match";
  receiver_agent_source_value?: string;
};

export type GranotFormLeadExpectedSnapshot = {
  quoted: boolean | null;
  cubic_feet: number | null;
  pickup_city: string | null;
  pickup_zip: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  destination_zip: string | null;
  delivery_state: string | null;
  receiver_agent: string | null;
};

/** A single candidate returned by `POST /api/v1/form-leads/search`. */
export type FormLeadSearchMatch = {
  _id: string;
  name?: string;
  email?: string;
  phone_number?: string;
  ref_no?: string;
  source_company?: string;
  lead_source_company?: string;
  source_granularity_key?: string;
  source_company_label_snapshot?: string;
  source_granularity_label_snapshot?: string;
  crm_source_label_snapshot?: string;
  quoted?: boolean;
  cubic_feet?: number;
  pickup_city?: string;
  pickup_zip?: string;
  pickup_state?: string;
  delivery_city?: string;
  destination_zip?: string;
  delivery_state?: string;
  duplicate?: boolean;
  booked?: string | null;
  receiver_agent?: string | null;
  /** Name snapshot of the agent already linked as `receiver_agent`, if any. */
  receiver_agent_name_snapshot?: string;
  receiver_agent_source?: string;
  receiver_agent_source_value?: string;
  score?: number;
  matched_fields?: string[];
};

/**
 * Result of the server-side scored form-lead search. `status` is `"found"`
 * for a single confident match, `"ambiguous"` when the top matches tie, and
 * `"not_found"` when nothing matched. The extension treats more than one match
 * as a conflict and refuses to auto-sync it.
 */
export type FormLeadSearchResult = {
  status: "found" | "not_found" | "ambiguous";
  found: boolean;
  message: string;
  matches: FormLeadSearchMatch[];
  lead?: FormLeadLookup & Record<string, unknown>;
  best_match?: FormLeadSearchMatch;
};

export type FormLeadSearchBody = {
  phone_number?: string;
  email?: string;
  name?: string;
  ref_no?: string;
  limit?: number;
};

export type GranotFormLeadMatchMethod =
  | "ref_no_exact"
  | "mongo_id"
  | "fallback"
  | "none";

export type GranotFormLeadMatchBody = {
  ref_no?: string;
  phone_number?: string;
  email?: string;
  name?: string;
  source_label: string;
  prior?: string;
};

export type GranotFormLeadMatchResult =
  | {
      status: "found";
      match_method: Exclude<GranotFormLeadMatchMethod, "none">;
      lead: FormLeadLookup;
      candidate_count: number;
      warnings: string[];
    }
  | {
      status: "conflict" | "no_match";
      match_method: "none";
      candidate_count: number;
      reason: string;
      warnings: string[];
    };

export async function getFormLeadById(id: string): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(
    `/api/v1/form-leads/${id}`,
    {
      method: "GET",
    },
  );

  return envelope.data;
}

export async function updateFormLead(
  id: string,
  payload: FormLeadUpdatePayload,
): Promise<FormLeadLookup> {
  const envelope = await vantageFetch<FormLeadLookup>(
    `/api/v1/form-leads/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );

  return envelope.data;
}

export async function applyGranotFormLead(
  id: string,
  item: import("../lifecycle/types").ExtensionGranotApplyItem,
): Promise<import("../lifecycle/types").ExtensionGranotApplyResult> {
  const envelope = await vantageFetch<
    import("../lifecycle/types").ExtensionGranotApplyResult
  >(`/api/v1/form-leads/${encodeURIComponent(id)}/granot-sync`, {
    method: "PATCH",
    body: JSON.stringify(item),
  });
  return envelope.data;
}

/**
 * Scored fallback search used when a Granot `ref_no` is not a current Vantage
 * Mongo id. Sends only the provided fields (the server requires at least one of
 * `phone_number`, `email`, `name`, `ref_no`).
 */
export async function searchFormLeads(
  body: FormLeadSearchBody,
): Promise<FormLeadSearchResult> {
  const envelope = await vantageFetch<FormLeadSearchResult>(
    `/api/v1/form-leads/search`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

  return envelope.data;
}

export async function resolveGranotFormLead(
  body: GranotFormLeadMatchBody,
): Promise<GranotFormLeadMatchResult> {
  const envelope = await vantageFetch<GranotFormLeadMatchResult>(
    "/api/v1/form-leads/granot-match",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  return envelope.data;
}
