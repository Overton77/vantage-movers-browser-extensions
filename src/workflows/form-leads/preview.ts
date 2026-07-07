// Form Leads preview workflow. Resolves each scanned row against Vantage and
// returns a `Map` of row id → preview model describing what running Sync would
// do. Pure of DOM/state: the popup merges the returned map into its own state
// and renders.
//
// Resolution order per row:
//   1. Direct id: rows with a valid Mongo `ref_no` (`status === "syncable"`) are
//      looked up via `GET /api/v1/form-leads/:id`.
//   2. Fallback: rows whose id is invalid (`invalid_ref_no`) — or whose direct
//      lookup returns not found — are searched via `POST /api/v1/form-leads/search`
//      using the row's phone + email. Exactly one match resolves a
//      `found_by_fallback`; more than one match becomes a `conflict`. When
//      tie-break criteria (ref_no, Granot source, quoted alignment) isolate one
//      candidate, the row stays `conflict` for messaging but becomes syncable.
//
// Runs in parallel; per-row failures are captured as `not_found` or
// `preview_error` so one bad row never blocks the rest of the preview.
import type {
  FormLeadLookup,
  FormLeadSearchBody,
  FormLeadSearchResult,
} from "../../utils/api";
import { MONGO_OBJECT_ID_RE } from "../../parsers/granot/common";
import { mapWithConcurrency } from "../../utils/concurrency";
import {
  flattenSearchMatches,
  pickResolvableFallbackMatch,
  searchMatchToLookup,
} from "./fallback-resolve";
import {
  isDuplicateQuarantineLead,
  isFallbackEligible,
  isSyncableRow,
} from "./payloads";
import {
  buildConflictResolvedFallbackPreview,
  buildFormLeadRowPreview,
} from "./preview-model";
import type { FollowUpRow, FormLeadRowPreview } from "./types";

export type FormLeadPreviewContext = {
  getFormLeadById: (id: string) => Promise<FormLeadLookup>;
  searchFormLeads: (body: FormLeadSearchBody) => Promise<FormLeadSearchResult>;
};

export type FormLeadPreviewOptions = {
  /**
   * Max number of Vantage requests in flight at once. Bounded to avoid a large
   * scanned table fanning out into dozens of simultaneous connections and
   * tripping the upstream database connection limit. Defaults to
   * `DEFAULT_PREVIEW_CONCURRENCY`.
   */
  concurrency?: number;
};

/** Default cap on simultaneous Vantage preview requests. */
export const DEFAULT_PREVIEW_CONCURRENCY = 4;

export async function previewFormLeadRows(
  rows: FollowUpRow[],
  context: FormLeadPreviewContext,
  options: FormLeadPreviewOptions = {},
): Promise<Map<string, FormLeadRowPreview>> {
  const previews = new Map<string, FormLeadRowPreview>();
  const targets = rows.filter(
    (row) => isDirectLookupEligible(row) || isFallbackEligible(row),
  );

  const concurrency = options.concurrency ?? DEFAULT_PREVIEW_CONCURRENCY;
  const resolved = await mapWithConcurrency(targets, concurrency, (row) =>
    previewRow(row, context),
  );

  targets.forEach((row, index) => {
    previews.set(row.id, resolved[index]);
  });

  return previews;
}

async function previewRow(
  row: FollowUpRow,
  context: FormLeadPreviewContext,
): Promise<FormLeadRowPreview> {
  // Fallback-only rows (invalid Mongo id) skip the direct lookup entirely.
  if (!isDirectLookupEligible(row)) {
    return runFallbackSearch(row, context);
  }

  try {
    const current = await context.getFormLeadById(row.refNo);
    if (isDuplicateQuarantineLead(current)) {
      return resolveDuplicateQuarantineRow(row, context);
    }
    return buildFormLeadRowPreview(row, current, "mongo_id");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const notFound = /not found/i.test(message) || /404/.test(message);
    if (notFound && (row.phone || row.email)) {
      // Direct id failed but we have fallback fields — recover via search.
      return runFallbackSearch(row, context);
    }
    return {
      state: notFound ? "not_found" : "preview_error",
      changes: [],
      matchMethod: "none",
      message: notFound
        ? "Form lead not found in Vantage — the ref_no may not be a current Mongo ID."
        : `Could not preview against Vantage: ${message}`,
      error: message,
    };
  }
}

function isDirectLookupEligible(row: FollowUpRow): boolean {
  return isSyncableRow(row) || MONGO_OBJECT_ID_RE.test(row.refNo);
}

async function resolveDuplicateQuarantineRow(
  row: FollowUpRow,
  context: FormLeadPreviewContext,
): Promise<FormLeadRowPreview> {
  if (row.phone || row.email) {
    return runFallbackSearch(row, context);
  }

  return {
    state: "not_found",
    changes: [],
    matchMethod: "none",
    message:
      "Granot ref_no points to a duplicate quarantined form lead. No phone/email available for fallback search.",
  };
}

async function runFallbackSearch(
  row: FollowUpRow,
  context: FormLeadPreviewContext,
): Promise<FormLeadRowPreview> {
  const body: FormLeadSearchBody = {};
  if (row.phone) body.phone_number = row.phone;
  if (row.email) body.email = row.email;

  if (!body.phone_number && !body.email) {
    return {
      state: "not_found",
      changes: [],
      matchMethod: "none",
      message: "No Vantage form lead matched this row.",
    };
  }

  try {
    const result = await context.searchFormLeads(body);
    const matches = flattenSearchMatches(result.matches).filter(
      (candidate) => !candidate.duplicate,
    );
    const resolvedLead = flattenResolvedLead(result.lead);
    const resolvedBestMatch = flattenResolvedMatch(result.best_match);

    if (matches.length > 1 || result.status === "ambiguous") {
      const resolution = pickResolvableFallbackMatch(row, matches);
      if (resolution) {
        return buildConflictResolvedFallbackPreview(
          row,
          searchMatchToLookup(resolution.match),
          matches.length,
          resolution.reason,
        );
      }

      return {
        state: "conflict",
        changes: [],
        matchMethod: "phone_and_email",
        matchCount: matches.length,
        message: `Ambiguous fallback match: ${matches.length} form leads matched this phone/email. Review before syncing.`,
      };
    }

    const flatMatch = matches[0] ? searchMatchToLookup(matches[0]) : undefined;
    const match = resolvedLead ?? resolvedBestMatch ?? flatMatch;
    if (result.status === "found" && match && !isDuplicateQuarantineLead(match)) {
      return buildFormLeadRowPreview(row, match, "phone_and_email");
    }

    return {
      state: "not_found",
      changes: [],
      matchMethod: "none",
      message: "No Vantage form lead matched this row.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      state: "preview_error",
      changes: [],
      matchMethod: "none",
      message: `Could not run fallback search against Vantage: ${message}`,
      error: message,
    };
  }
}

function flattenResolvedLead(
  lead: FormLeadLookup | (FormLeadLookup & Record<string, unknown>) | undefined,
): FormLeadLookup | undefined {
  if (!lead || isDuplicateQuarantineLead(lead)) {
    return undefined;
  }
  return {
    _id: String(lead._id),
    ref_no: lead.ref_no,
    quoted: lead.quoted,
    cubic_feet: lead.cubic_feet,
    booked: lead.booked,
    duplicate: lead.duplicate,
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
  };
}

function flattenResolvedMatch(
  match: FormLeadSearchResult["best_match"],
): FormLeadLookup | undefined {
  if (!match) {
    return undefined;
  }
  const [flat] = flattenSearchMatches([match as FormLeadSearchResult["matches"][number]]);
  if (!flat || isDuplicateQuarantineLead(flat)) {
    return undefined;
  }
  return searchMatchToLookup(flat);
}
