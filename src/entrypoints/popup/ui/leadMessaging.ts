// Pure owner-facing messaging for Form Lead and Call Lead scan/sync state.
// Renderers turn these display models into DOM; this module has no DOM access.
import type { CallLeadsState, FormLeadsState } from "../../../app/state";
import type {
  BookedCallLeadMatchMethod,
  BookedCallLeadReconciliationResult,
  CallLeadEnrichmentResult,
  CallLeadMatchMethod,
} from "../../../utils/api";
import type { CallLeadPreviewRow } from "../../../workflows/call-leads/types";
import type {
  FollowUpRow,
  FormLeadMatchMethod,
  FormLeadRowPreview,
  RowSyncResult,
} from "../../../workflows/form-leads/types";
import { isRowSyncable } from "../../../workflows/form-leads/payloads";

export type SummaryMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "bad";
  help?: string;
};

export type RowStatusCard = {
  title: string;
  tone: "neutral" | "good" | "warn" | "bad";
  lines: string[];
  chips: Array<{ label: string; value: string; tone?: SummaryMetric["tone"] }>;
};

type SalesRepOptions = {
  linkedName?: string;
  warnings?: string[];
};

type CallLeadResult =
  | CallLeadEnrichmentResult
  | BookedCallLeadReconciliationResult;

export function buildFormLeadScanMetrics(state: FormLeadsState): SummaryMetric[] {
  const matchedIds = new Set<string>();
  const notFoundIds = new Set<string>();
  const reviewIds = new Set<string>();
  let fallbackMatches = 0;

  for (const row of state.parsedRows) {
    if (row.status === "unsupported_prior" || row.status === "missing_prior") {
      reviewIds.add(row.id);
    }
    const preview = state.previews.get(row.id);
    if (!preview) {
      if (row.status === "invalid_ref_no") reviewIds.add(row.id);
      continue;
    }
    if (preview.resolvedVantageId || preview.current) {
      matchedIds.add(row.id);
    }
    if (preview.state === "found_by_fallback") {
      fallbackMatches += 1;
    }
    if (preview.state === "not_found") {
      notFoundIds.add(row.id);
    }
    if (
      preview.state === "preview_error" ||
      (preview.state === "conflict" && !preview.resolvedVantageId)
    ) {
      reviewIds.add(row.id);
    }
    if (row.status === "invalid_ref_no" && !preview.resolvedVantageId) {
      reviewIds.add(row.id);
    }
  }

  const syncable = state.parsedRows.filter((row) =>
    isFormRowSyncableForMetrics(row, state.previews.get(row.id)),
  ).length;
  const selected = state.parsedRows.filter((row) =>
    state.selectedRowIds.has(row.id),
  ).length;

  const metrics: SummaryMetric[] = [
    { label: "Parsed Rows", value: state.parsedRows.length },
    { label: "Matched In Vantage", value: matchedIds.size, tone: "good" },
    {
      label: "Not Found",
      value: notFoundIds.size,
      tone: notFoundIds.size > 0 ? "warn" : "neutral",
    },
    {
      label: "Needs Review",
      value: reviewIds.size,
      tone: reviewIds.size > 0 ? "warn" : "neutral",
    },
    { label: "Syncable", value: syncable, tone: syncable > 0 ? "good" : "neutral" },
    { label: "Selected", value: selected },
  ];

  if (fallbackMatches > 0) {
    metrics.push({
      label: "Fallback Matches",
      value: fallbackMatches,
      tone: "good",
      help: "Matched by phone and email after Granot ref_no did not resolve.",
    });
  }

  return metrics;
}

export function buildCallLeadScanMetrics(state: CallLeadsState): SummaryMetric[] {
  const sections = state.preview?.sections ?? [];
  const followUp = sections.find((section) => section.key === "followUpEstimates");
  const booked = sections.find((section) => section.key === "bookedJobs");
  const allResults = [
    ...state.enrichmentRows.map((row) => row.result),
    ...state.bookedReconciliationRows.map((row) => row.result),
  ].filter((result): result is CallLeadResult => Boolean(result));

  const matched = allResults.filter(hasCallLeadMatch).length;
  const notFound = allResults.filter((result) => result.status === "no_match").length;
  const syncable =
    state.enrichmentRows.filter((row) =>
      isCallStatusSyncable(row.result?.status),
    ).length +
    state.bookedReconciliationRows.filter((row) =>
      isCallStatusSyncable(row.result?.status),
    ).length;
  const selected = state.enrichmentRows.filter((row) =>
    state.selectedRowIds.has(row.payload.row_id),
  ).length;
  const byPhone = allResults.filter((result) =>
    result.match_method === "phone_only" || result.match_method === "phone_and_job_no",
  ).length;
  const byJobNo = allResults.filter((result) =>
    result.match_method === "job_no_only" || result.match_method === "phone_and_job_no",
  ).length;
  const throughBooking = allResults.filter(
    (result) => result.match_method === "job_no_with_booking",
  ).length;
  const hasBooking = allResults.filter((result) => result.has_booking).length;

  const metrics: SummaryMetric[] = [
    {
      label: "Tables Found",
      value: sections.filter((section) => section.tableFound).length,
    },
    { label: "Follow Up Rows", value: followUp?.rows.length ?? 0 },
    { label: "Booked Job Rows", value: booked?.rows.length ?? 0 },
    { label: "Matched In Vantage", value: matched, tone: "good" },
    {
      label: "Not Found",
      value: notFound,
      tone: notFound > 0 ? "warn" : "neutral",
    },
    { label: "Syncable", value: syncable, tone: syncable > 0 ? "good" : "neutral" },
    { label: "Selected", value: selected },
  ];

  if (byPhone > 0) metrics.push({ label: "Matched By Phone", value: byPhone });
  if (byJobNo > 0) metrics.push({ label: "Matched By Job No", value: byJobNo });
  if (throughBooking > 0) {
    metrics.push({ label: "Matched Through Booking", value: throughBooking });
  }
  if (hasBooking > 0) metrics.push({ label: "Has Booking", value: hasBooking });

  return metrics;
}

export function buildFormLeadCollapsedModel(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
  result: RowSyncResult | undefined,
  syncable: boolean,
  salesRep: SalesRepOptions = {},
): RowStatusCard {
  const title = `${row.tableTitle ?? "Follow Up Estimates"} #${row.displayNumber || row.rowIndex} ${row.customer || "Unknown customer"}`;
  const crmFacts = [
    row.jobNo ? `job_no ${row.jobNo}` : undefined,
    typeof row.cubicFeet === "number" ? `cubic_feet ${row.cubicFeet}` : undefined,
    row.estCf ? `est_cf ${row.estCf}` : undefined,
    row.prior ? `prior ${row.prior}` : undefined,
  ].filter(Boolean) as string[];
  const match = formatFormMatchState(row, preview);
  const sync = formatFormSyncState(row, preview, result, syncable);
  const booking = preview?.current?.booked ? "Has booking" : undefined;
  const salesRepText = formatSalesRepState(
    row.salesRepRaw,
    salesRep.linkedName ?? preview?.current?.receiver_agent_name_snapshot,
    salesRep.warnings,
  );

  return {
    title,
    tone: rowCardTone(result?.status ?? preview?.state, syncable),
    lines: [
      crmFacts.join(" · "),
      [match, sync, booking, salesRepText].filter(Boolean).join(" · "),
    ].filter(Boolean),
    chips: [],
  };
}

export function buildCallLeadCollapsedModel(
  row: CallLeadPreviewRow,
  workflow: "followUp" | "booked",
  result: CallLeadResult | undefined,
  canSync: boolean,
  salesRep: SalesRepOptions = {},
): RowStatusCard {
  const tableName = workflow === "booked" ? "Booked Jobs" : "Follow Up Estimates";
  const displayNumber = row.values.no || String(row.rowIndex);
  const title = `${tableName} #${displayNumber} ${row.values.customer || "Unknown customer"}`;
  const crmFacts = [
    row.values.job_no ? `job_no ${row.values.job_no}` : undefined,
    row.values.est_cf ? `est_cf ${row.values.est_cf}` : undefined,
    row.values.prior ? `prior ${row.values.prior}` : undefined,
  ].filter(Boolean) as string[];
  const match = result?.match_method
    ? formatMatchMethod(result.match_method)
    : "Preview not available";
  const sync = formatSyncOutcome(result?.status, result?.changes, result?.message, canSync);
  const booking = result?.has_booking ? "Has booking" : undefined;
  const salesRepText = formatSalesRepState(
    row.values.user ?? row.values.rep,
    salesRep.linkedName ?? result?.receiver_agent_name_snapshot,
    salesRep.warnings ?? result?.warnings,
  );
  const sourceMismatch = formatCallLeadSourceMismatch(row, result);

  const firstWarning = result?.warnings.find(Boolean);
  const lines = [
    crmFacts.join(" · "),
    [match, sync, booking, salesRepText].filter(Boolean).join(" · "),
    sourceMismatch,
  ].filter((line): line is string => Boolean(line));
  if (firstWarning && result?.status !== "unchanged") {
    lines.push(`Warning: ${firstWarning}`);
  }

  return {
    title,
    tone: rowCardTone(result?.status, canSync),
    lines,
    chips: [],
  };
}

export function buildFormLeadExpandedSummary(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
  result: RowSyncResult | undefined,
  salesRep: SalesRepOptions = {},
): RowStatusCard {
  const lines: string[] = [];
  const match = formatFormMatchState(row, preview);
  if (preview?.resolvedVantageId) {
    lines.push(`Vantage found this form lead: ${match} (id ${preview.resolvedVantageId}).`);
  } else if (preview?.state === "not_found") {
    lines.push("Vantage did not find a form lead for this row.");
  } else if (preview?.state === "preview_error") {
    lines.push(`Vantage preview failed: ${preview.error ?? preview.message}`);
  } else {
    lines.push("Vantage match is not available yet.");
  }

  if (preview?.current?.booked) {
    lines.push("The booking link is already attached and will be preserved.");
  }
  lines.push(formatFormExpandedSyncLine(row, preview, result));
  lines.push(
    formatSalesRepState(
      row.salesRepRaw,
      salesRep.linkedName ?? preview?.current?.receiver_agent_name_snapshot,
      salesRep.warnings,
    ),
  );
  for (const warning of preview?.warnings ?? []) {
    lines.push(`Warning: ${warning}`);
  }

  return {
    title: "Row Summary",
    tone: rowCardTone(result?.status ?? preview?.state, Boolean(preview?.resolvedVantageId)),
    lines,
    chips: [],
  };
}

export function buildCallLeadExpandedSummary(
  row: CallLeadPreviewRow,
  workflow: "followUp" | "booked",
  result: CallLeadResult | undefined,
  salesRep: SalesRepOptions = {},
): RowStatusCard {
  const tableName = workflow === "booked" ? "Booked Jobs" : "Follow Up Estimates";
  const lines: string[] = [];
  if (
    result?.call_lead_id ||
    (result && "booking_id" in result && result.booking_id)
  ) {
    const method = result.match_method ? formatMatchMethod(result.match_method) : "Matched";
    const jobNo = result.job_no ?? row.values.job_no;
    const jobText = jobNo ? ` job_no ${jobNo}` : "";
    lines.push(`Vantage ${method.toLowerCase()} for this ${tableName} row${jobText}.`);
  } else if (result?.status === "no_match") {
    lines.push(`Vantage did not find a call lead for this ${tableName} row.`);
  } else if (result?.message) {
    lines.push(result.message);
  } else {
    lines.push("Vantage match is not available yet.");
  }
  if (result?.has_booking) {
    lines.push("The Vantage booking link is attached and will be preserved.");
  }
  const sourceMismatch = formatCallLeadSourceMismatch(row, result);
  if (sourceMismatch) {
    lines.push(sourceMismatch);
  }
  lines.push(formatCallExpandedSyncLine(result));
  lines.push(
    formatSalesRepState(
      row.values.user ?? row.values.rep,
      salesRep.linkedName ?? result?.receiver_agent_name_snapshot,
      salesRep.warnings ?? result?.warnings,
    ),
  );
  for (const warning of result?.warnings ?? []) {
    lines.push(`Warning: ${warning}`);
  }

  return {
    title: "Row Summary",
    tone: rowCardTone(result?.status, Boolean(result && isCallStatusSyncable(result.status))),
    lines,
    chips: [],
  };
}

export function formatMatchMethod(
  method: FormLeadMatchMethod | CallLeadMatchMethod | BookedCallLeadMatchMethod,
): string {
  switch (method) {
    case "ref_no_exact":
      return "Matched by exact ref_no";
    case "mongo_id":
      return "Matched by Mongo id";
    case "fallback":
      return "Matched by source-gated fallback";
    case "phone_and_job_no":
      return "Matched by phone + job_no";
    case "phone_only":
      return "Matched by phone";
    case "job_no_only":
      return "Matched by job_no";
    case "job_no_with_booking":
      return "Matched through booking";
    case "none":
    default:
      return "Not found";
  }
}

export function formatSyncOutcome(
  status: string | undefined,
  changes: string[] = [],
  message?: string,
  canSync = false,
): string {
  const visibleChanges = changes.filter((change) => !isLocationChange(change));
  switch (status) {
    case "updated":
      return visibleChanges.length > 0
        ? `Updated: ${formatChangedFields(visibleChanges)}`
        : changes.length > 0
          ? "Updated"
        : message
          ? `Updated: ${message}`
          : "Updated";
    case "unchanged":
      return "Unchanged";
    case "updateable":
      return visibleChanges.length > 0
        ? `Will update: ${formatChangedFields(visibleChanges)}`
        : changes.length > 0
          ? "Will update"
          : "Unchanged";
    case "failed":
      return message ? `Failed: ${message}` : "Failed";
    case "conflict":
    case "invalid":
    case "booking_missing":
      return message ? `Needs review: ${message}` : "Needs review";
    case "no_match":
      return "Not found";
    default:
      return canSync ? "Will update" : "Needs review";
  }
}

export function formatSalesRepState(
  rawValue?: string,
  linkedName?: string,
  warnings: string[] = [],
): string {
  if (linkedName) return `Sales Rep: ${linkedName}`;
  const receiverWarning = warnings.find((warning) =>
    /receiver|agent|sales rep|crm username/i.test(warning),
  );
  if (receiverWarning) return `Sales Rep: ${receiverWarning}`;
  const normalized = rawValue?.trim();
  if (normalized) return `Sales Rep: CRM ${normalized.toUpperCase()} not linked`;
  return "Sales Rep: none";
}

function formatFormMatchState(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
): string {
  if (preview?.matchMethod) return formatMatchMethod(preview.matchMethod);
  if (preview?.state === "not_found") return "Not found";
  if (preview?.state === "preview_error") return "Needs review";
  if (row.status === "invalid_ref_no") return "Granot ref_no did not resolve";
  return "Preview not available";
}

function formatFormSyncState(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
  result: RowSyncResult | undefined,
  syncable: boolean,
): string {
  if (result) {
    if (result.status === "updated") return result.message ? `Updated: ${result.message}` : "Updated";
    if (result.status === "unchanged") return "Unchanged";
    if (result.status === "failed") return result.message ? `Failed: ${result.message}` : "Failed";
    if (result.status === "skipped") return result.message ? `Skipped: ${result.message}` : "Skipped";
  }
  if (!syncable) return "Needs review";
  if (!preview) return "Will update";
  if (preview.changes.length > 0) return `Will update: ${formatChangedFields(preview.changes)}`;
  if (preview.hasChanges) return "Will update";
  if (preview.state === "idempotent" || preview.state === "has_booking" || preview.state === "found_by_fallback") {
    return "Unchanged";
  }
  if (row.status === "syncable") return "Will update";
  return "Needs review";
}

function formatFormExpandedSyncLine(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
  result: RowSyncResult | undefined,
): string {
  if (result) return formatSyncOutcome(result.status, [], result.message, true);
  if (!preview) return row.reason ? `Needs review: ${row.reason}` : "Sync state is not available yet.";
  if (preview.changes.length > 0) return `Sync will update ${formatChangedFields(preview.changes)}.`;
  if (preview.hasChanges) return "Sync will update the form lead.";
  if (preview.resolvedVantageId) return "Sync is unchanged: Vantage already matches this row.";
  return preview.message;
}

function formatCallExpandedSyncLine(result: CallLeadResult | undefined): string {
  if (!result) return "Sync state is not available yet.";
  if (result.status === "updateable" && result.changes.length === 0) {
    return "Sync is unchanged: no lead or booking fields need changes.";
  }
  return formatSyncOutcome(result.status, result.changes, result.message, isCallStatusSyncable(result.status));
}

function formatCallLeadSourceMismatch(
  row: CallLeadPreviewRow,
  result: CallLeadResult | undefined,
): string | undefined {
  if (!result || !isCallLeadIdentityMatch(result.match_method)) {
    return undefined;
  }

  const crmSource = row.values.source?.trim();
  if (!crmSource) {
    return undefined;
  }

  if (result.status === "conflict") {
    const vantageSource = sourceDisplayLabel(result);
    return `Source mismatch: CRM source "${crmSource}" differs from the matched Vantage source${vantageSource ? ` "${vantageSource}"` : ""}. Review this row before syncing.`;
  }

  const hasLeadSourceChange = result.changes.some((change) =>
    isSourceMetadataChange(change),
  );
  const hasSourceConflict = /source_company|lead_source_company|source_granularity|crm_source_label|source label/i.test(
    result.message,
  );
  if (!hasLeadSourceChange && !hasSourceConflict) {
    return undefined;
  }

  const vantageSource = sourceDisplayLabel(result);
  return `Source mismatch: CRM source "${crmSource}" differs from the matched Vantage source${vantageSource ? ` "${vantageSource}"` : ""}. Review this row before syncing.`;
}

function isSourceMetadataChange(change: string): boolean {
  return /(?:^|\.)?(source_company|lead_source_company|source_granularity_id|source_granularity_key|source_company_label_snapshot|source_granularity_label_snapshot|crm_source_label_snapshot)\b/i.test(
    change,
  );
}

function isLocationChange(change: string): boolean {
  const field = extractFieldName(change);
  return /^(?:lead\.|booking\.)?(?:pickup_city|pickup_state|pickup_zip|delivery_city|delivery_state|delivery_zip|destination_zip|from|from_zip|to|to_zip)$/i.test(
    field,
  );
}

function sourceDisplayLabel(result: CallLeadResult): string {
  return (
    result.crm_source_label_snapshot ||
    result.source_granularity_label_snapshot ||
    result.source_company_label_snapshot ||
    result.source_granularity_key ||
    ""
  );
}

function isCallLeadIdentityMatch(
  method: CallLeadResult["match_method"] | undefined,
): boolean {
  return (
    method === "phone_and_job_no" ||
    method === "phone_only" ||
    method === "job_no_only" ||
    method === "job_no_with_booking"
  );
}

function formatChangedFields(changes: string[]): string {
  const fields = changes.map(extractFieldName).filter(Boolean);
  if (fields.length === 0) return changes.join(", ");
  return joinHumanList([...new Set(fields)]);
}

function extractFieldName(change: string): string {
  const first = change.trim().split(/\s+/)[0] ?? "";
  return first.replace(/[:=,]/g, "");
}

function joinHumanList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function hasCallLeadMatch(result: CallLeadResult): boolean {
  return Boolean(
    result.call_lead_id ||
      ("booking_id" in result && result.booking_id) ||
      (result.match_method && result.match_method !== "none"),
  );
}

function isCallStatusSyncable(status?: string): boolean {
  return status === "updateable" || status === "unchanged" || status === "updated";
}

function isFormRowSyncableForMetrics(
  row: FollowUpRow,
  preview: FormLeadRowPreview | undefined,
): boolean {
  return isRowSyncable(row, preview);
}

function rowCardTone(status: string | undefined, canSync: boolean): RowStatusCard["tone"] {
  if (status === "failed" || status === "preview_error" || status === "invalid") return "bad";
  if (
    status === "conflict" ||
    status === "no_match" ||
    status === "not_found" ||
    status === "booking_missing" ||
    !canSync
  ) {
    return "warn";
  }
  if (status === "updated" || status === "unchanged" || status === "updateable") return "good";
  return "neutral";
}

function syncTone(
  status: string | undefined,
  previewState: string | undefined,
  canSync: boolean,
): SummaryMetric["tone"] {
  if (status === "failed" || previewState === "preview_error") return "bad";
  if (!canSync || status === "conflict" || status === "no_match") return "warn";
  if (status === "updated" || status === "unchanged" || status === "updateable") return "good";
  return "neutral";
}
