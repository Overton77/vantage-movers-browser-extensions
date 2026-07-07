// Resolves ambiguous phone/email fallback matches to a single Vantage form lead
// when tie-break criteria are met. The popup still surfaces a conflict message
// so the owner can review before syncing.
import type { FormLeadLookup, FormLeadSearchMatch } from "../../utils/api";
import { deriveQuotedFromPrior } from "./payloads";
import type { FollowUpRow } from "./types";

/** Granot CRM source labels mapped to Vantage `source_company` slugs. */
const GRANOT_SOURCE_TO_COMPANY = Object.fromEntries(
  [
    ["Main Site Forms", "main_site"],
    ["Main Site Inbounds", "main_site"],
    ["GetMovers Forms", "get_movers_leads"],
    ["Get Movers Forms", "get_movers_leads"],
    ["GetMovers Inbounds", "get_movers_leads"],
    ["Get Movers Inbounds", "get_movers_leads"],
    ["Best Relocation Forms", "best_relocation_leads"],
    ["BestRelocation Forms", "best_relocation_leads"],
    ["Best Relocation Inbounds", "best_relocation_leads"],
    ["BestRelocation Inbounds", "best_relocation_leads"],
    ["TBM Forms", "tbm_leads"],
    ["TBM Inbounds", "tbm_leads"],
    ["TBM Prime Forms", "tbm_prime_leads"],
    ["TBM Forms Prime", "tbm_prime_leads"],
    ["TBM Prime Inbounds", "tbm_prime_leads"],
    ["Top10 Forms", "top10_leads"],
    ["Top10 Inbounds", "top10_leads"],
    ["10 Best Forms", "tbm_leads"],
    ["10Best Forms", "tbm_leads"],
    ["10best Forms", "tbm_leads"],
    ["10 Best Inbounds", "tbm_leads"],
    ["10Best Inbounds", "tbm_leads"],
    ["10best Inbounds", "tbm_leads"],
  ].map(([label, company]) => [normalizeSourceLabel(label), company]),
);

export type FallbackMatchResolution =
  | {
      match: FormLeadSearchMatch;
      reason: string;
    }
  | undefined;

type RawSearchMatch =
  | FormLeadSearchMatch
  | {
      lead?: FormLeadSearchMatch & Record<string, unknown>;
      score?: number;
      matched_fields?: string[];
    };

/** Normalizes server search matches (nested `lead` or flat) into one shape. */
export function flattenSearchMatches(
  matches: RawSearchMatch[],
): FormLeadSearchMatch[] {
  return matches.map(flattenSearchMatch);
}

function flattenSearchMatch(raw: RawSearchMatch): FormLeadSearchMatch {
  if ("lead" in raw && raw.lead && typeof raw.lead === "object") {
    const lead = raw.lead;
    return {
      _id: String(lead._id),
      name: typeof lead.name === "string" ? lead.name : undefined,
      email: typeof lead.email === "string" ? lead.email : undefined,
      phone_number:
        typeof lead.phone_number === "string" ? lead.phone_number : undefined,
      ref_no: typeof lead.ref_no === "string" ? lead.ref_no : undefined,
      quoted: typeof lead.quoted === "boolean" ? lead.quoted : undefined,
      cubic_feet: typeof lead.cubic_feet === "number" ? lead.cubic_feet : undefined,
      duplicate: lead.duplicate === true,
      booked:
        lead.booked === null || typeof lead.booked === "string"
          ? lead.booked
          : undefined,
      receiver_agent:
        lead.receiver_agent === null || typeof lead.receiver_agent === "string"
          ? lead.receiver_agent
          : undefined,
      receiver_agent_name_snapshot:
        typeof lead.receiver_agent_name_snapshot === "string"
          ? lead.receiver_agent_name_snapshot
          : undefined,
      receiver_agent_source:
        typeof lead.receiver_agent_source === "string"
          ? lead.receiver_agent_source
          : undefined,
      receiver_agent_source_value:
        typeof lead.receiver_agent_source_value === "string"
          ? lead.receiver_agent_source_value
          : undefined,
      source_company:
        typeof lead.source_company === "string" ? lead.source_company : undefined,
      lead_source_company:
        typeof lead.lead_source_company === "string" ? lead.lead_source_company : undefined,
      source_granularity_key:
        typeof lead.source_granularity_key === "string"
          ? lead.source_granularity_key
          : undefined,
      source_company_label_snapshot:
        typeof lead.source_company_label_snapshot === "string"
          ? lead.source_company_label_snapshot
          : undefined,
      source_granularity_label_snapshot:
        typeof lead.source_granularity_label_snapshot === "string"
          ? lead.source_granularity_label_snapshot
          : undefined,
      crm_source_label_snapshot:
        typeof lead.crm_source_label_snapshot === "string"
          ? lead.crm_source_label_snapshot
          : undefined,
      score: raw.score,
      matched_fields: raw.matched_fields,
    };
  }

  const flat = raw as FormLeadSearchMatch;
  return {
    ...flat,
    _id: String(flat._id),
  };
}

export function searchMatchToLookup(
  match: FormLeadSearchMatch,
): FormLeadLookup {
  return {
    _id: match._id,
    ref_no: match.ref_no,
    quoted: match.quoted,
    cubic_feet: match.cubic_feet,
    booked: match.booked,
    duplicate: match.duplicate,
    receiver_agent: match.receiver_agent,
    receiver_agent_name_snapshot: match.receiver_agent_name_snapshot,
    receiver_agent_source: match.receiver_agent_source,
    receiver_agent_source_value: match.receiver_agent_source_value,
  };
}

/**
 * Picks one fallback candidate when phone/email search returned multiple leads.
 * Tie-break order: unique ref_no, unique Granot source label, unique quoted
 * alignment with Granot `prior`.
 */
export function pickResolvableFallbackMatch(
  row: FollowUpRow,
  matches: FormLeadSearchMatch[],
): FallbackMatchResolution {
  const candidates = matches.filter((match) => match.duplicate !== true);
  if (candidates.length === 0) {
    return undefined;
  }

  const refNo = row.refNo?.trim();
  if (refNo) {
    const byRef = candidates.filter((match) => match.ref_no?.trim() === refNo);
    const resolved = pickSingle(byRef);
    if (resolved) {
      return {
        match: resolved,
        reason: "Auto-selected the lead whose ref_no matches the Granot row.",
      };
    }
  }

  const sourceCompany = resolveSourceCompany(row.source);
  if (sourceCompany) {
    const bySource = candidates.filter(
      (match) => match.source_company === sourceCompany,
    );
    const resolved = pickSingle(bySource);
    if (resolved) {
      return {
        match: resolved,
        reason: `Auto-selected the ${row.source?.trim()} lead for this Granot row.`,
      };
    }
  }

  const intendedQuoted = deriveQuotedFromPrior(row.prior);
  if (typeof intendedQuoted === "boolean") {
    const byQuoted = candidates.filter((match) => match.quoted === intendedQuoted);
    const resolved = pickSingle(byQuoted);
    if (resolved) {
      return {
        match: resolved,
        reason: `Auto-selected the lead whose quoted=${String(intendedQuoted)} matches Granot prior ${row.prior}.`,
      };
    }
  }

  return undefined;
}

function pickSingle(
  matches: FormLeadSearchMatch[],
): FormLeadSearchMatch | undefined {
  return matches.length === 1 ? matches[0] : undefined;
}

function resolveSourceCompany(source?: string): string | undefined {
  const label = normalizeSourceLabel(source);
  if (!label) {
    return undefined;
  }
  return GRANOT_SOURCE_TO_COMPANY[label];
}

function normalizeSourceLabel(source?: string): string {
  return source?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
}
