import type { CallLeadPreviewRow } from "../parsers/granot/call-leads";
import type { FollowUpRow } from "../workflows/form-leads/types";
import type { ChannelOperationKind, ExtensionGranotApplyItem } from "./types";

export function buildFormLeadStatement(
  row: FollowUpRow,
): Record<string, string | number | null> {
  const booked = row.tableSource === "bookedJobs";
  return omitUndefined({
    source: row.source ?? null,
    job_no: row.jobNo ?? null,
    ref_no: row.refNo,
    customer: row.customer ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    from: row.from ?? null,
    from_zip: row.fromZip ?? null,
    to: row.to ?? null,
    to_zip: row.toZip ?? null,
    est_cf: row.estCf ?? null,
    priority: row.prior,
    user: row.userRaw ?? null,
    rep: row.repRaw ?? null,
    event_type: booked ? "Booked" : undefined,
  });
}

export function formLeadOperationKind(row: FollowUpRow): ChannelOperationKind {
  return row.tableSource === "bookedJobs"
    ? "booking_action_apply"
    : "lead_snapshot_apply";
}

export function buildCallLeadStatement(
  row: CallLeadPreviewRow,
  kind: ChannelOperationKind,
): Record<string, string | number | null> {
  return omitUndefined({
    source: scalar(row.values.source),
    job_no: scalar(row.values.job_no),
    customer: scalar(row.values.customer),
    phone: scalar(row.values.phone),
    email: scalar(row.values.email),
    from: scalar(row.values.from),
    from_zip: scalar(row.values.from_zip),
    to: scalar(row.values.to),
    to_zip: scalar(row.values.to_zip),
    est_cf: scalar(row.values.est_cf),
    priority: scalar(row.values.prior),
    user: scalar(row.values.user),
    rep: scalar(row.values.rep),
    book_date: scalar(row.values.book_date),
    event_type: kind === "booking_action_apply" ? "Booked" : undefined,
  });
}

export function statementHasQuoted(statement: Record<string, string | number | null>): boolean {
  return Object.prototype.hasOwnProperty.call(statement, "quoted");
}

function scalar(value: string | undefined): string | null | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function omitUndefined(
  value: Record<string, string | number | null | undefined>,
): Record<string, string | number | null> {
  const result: Record<string, string | number | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = entry;
    }
  }
  return result;
}

export function withOperationId(
  item: Omit<ExtensionGranotApplyItem, "operation_id">,
  operation_id: string,
): ExtensionGranotApplyItem {
  return { ...item, operation_id };
}
