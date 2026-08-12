// Builds the pre-sync "preview" model for a Form Lead row by comparing the
// parsed Granot row against the current Vantage form lead. Pure / UI-free: the
// popup turns the returned `state` + `message` into badges and copy.
//
// Supports the aligned match methods: exact provider ref, Mongo id, and
// source-gated fallback. The resolved Vantage `_id` is always preserved.
import type { FormLeadLookup } from "../../utils/api";
import {
  buildFormLeadUpdatePayload,
  deriveQuotedFromPrior,
  isCubicFeetSyncable,
  isFormLeadPriorSyncable,
  rowToSyncCandidate,
} from "./payloads";
import type {
  FollowUpRow,
  FormLeadMatchMethod,
  FormLeadRowPreview,
} from "./types";

export function buildFormLeadRowPreview(
  row: FollowUpRow,
  current: FormLeadLookup,
  matchMethod: FormLeadMatchMethod = "mongo_id",
): FormLeadRowPreview {
  const isFallback = matchMethod === "fallback";
  const intendedQuoted = isFallback
    ? deriveQuotedFromPrior(row.prior)
    : row.quoted;
  const matchedBy =
    matchMethod === "mongo_id" ? "by Mongo id" : "by exact ref_no";

  const hasBooking = Boolean(current.booked);
  const fieldSyncable = isFormLeadPriorSyncable(row.prior);
  const quotedDiffers =
    fieldSyncable &&
    typeof intendedQuoted === "boolean" &&
    current.quoted !== intendedQuoted;
  // cubic_feet only syncs for prior 1/5, so a prior-0 row never reports a
  // cubic_feet change even if the parsed value differs from Vantage.
  const cubicDiffers =
    isCubicFeetSyncable(row.prior) &&
    typeof row.cubicFeet === "number" &&
    current.cubic_feet !== row.cubicFeet;
  const changes: string[] = [];
  if (quotedDiffers) {
    changes.push(`quoted ${formatValue(current.quoted)} → ${intendedQuoted}`);
  }
  if (cubicDiffers) {
    changes.push(
      `cubic_feet ${formatValue(current.cubic_feet)} → ${row.cubicFeet}`,
    );
  }
  const locationPayload = buildFormLeadUpdatePayload(
    rowToSyncCandidate(row),
    current,
  );
  for (const field of OWNER_VISIBLE_LOCATION_FIELDS) {
    const nextValue = locationPayload[field];
    if (
      nextValue !== undefined &&
      isNotFoundState(current[field])
    ) {
      changes.push(`${field} ${formatValue(current[field])} → ${nextValue}`);
    }
  }
  const hasActualChanges =
    quotedDiffers ||
    cubicDiffers ||
    Object.keys(locationPayload).length > 0;

  const resolvedVantageId = current._id;
  const disabledFieldSyncNote = fieldSyncable
    ? undefined
    : ` Prior ${row.prior || "blank"} is not quote/cubic syncable; sync can still update receiver_agent when the CRM username matches an Agent.`;

  if (isFallback) {
    const bookingNote = hasBooking
      ? ` Booking attached (booking ${String(current.booked)}); the booking link is preserved.`
      : "";
    const changeNote = disabledFieldSyncNote
      ? disabledFieldSyncNote
      : !hasActualChanges
        ? " Sync is idempotent (no fields change)."
        : changes.length > 0
          ? ` Sync will change ${changes.join(" and ")}.`
          : " Sync will update the form lead.";
    return {
      state: "found_by_fallback",
      current,
      hasChanges: hasActualChanges,
      changes,
      matchMethod,
      resolvedVantageId,
      matchCount: 1,
      message: `No lead found with Granot ref_no, but found by phone and email (Vantage id ${resolvedVantageId}).${bookingNote}${changeNote}`,
    };
  }

  if (hasBooking) {
    return {
      state: "has_booking",
      current,
      hasChanges: hasActualChanges,
      changes,
      matchMethod,
      resolvedVantageId,
      message:
        disabledFieldSyncNote
          ? `Found form lead ${matchedBy}; it has a booking attached (booking ${String(current.booked)}).${disabledFieldSyncNote}`
          : !hasActualChanges
          ? `Found form lead ${matchedBy}; it has a booking attached (booking ${String(current.booked)}). Running sync is idempotent (no fields change).`
          : changes.length > 0
            ? `Found form lead ${matchedBy}; it has a booking attached (booking ${String(current.booked)}). Running sync will refresh ${changes.join(", ")} on the form lead. The booking link is preserved.`
            : `Found form lead ${matchedBy}; it has a booking attached (booking ${String(current.booked)}). Running sync will update the form lead. The booking link is preserved.`,
    };
  }

  if (!hasActualChanges) {
    return {
      state: "idempotent",
      current,
      hasChanges: false,
      changes,
      matchMethod,
      resolvedVantageId,
      message:
        disabledFieldSyncNote
          ? `Found form lead ${matchedBy}. No booking attached.${disabledFieldSyncNote}`
          : `Found form lead ${matchedBy}. No booking attached and quoted + cubic_feet already match the Granot row — sync is idempotent.`,
    };
  }

  return {
    state: "will_update",
    current,
    hasChanges: true,
    changes,
    matchMethod,
    resolvedVantageId,
    message:
      changes.length > 0
        ? `Found form lead ${matchedBy}. No booking attached. Sync will change ${changes.join(" and ")}.`
        : `Found form lead ${matchedBy}. No booking attached. Sync will update the form lead.`,
  };
}

export function buildConflictResolvedFallbackPreview(
  row: FollowUpRow,
  current: FormLeadLookup,
  matchCount: number,
  resolutionReason: string,
): FormLeadRowPreview {
  const base = buildFormLeadRowPreview(row, current, "fallback");
  const hasActualChanges = hasFormLeadChanges(row, current, "fallback");
  const changeNote = !isFormLeadPriorSyncable(row.prior)
    ? ` Prior ${row.prior} is not quote/cubic syncable; sync can still update receiver_agent when the CRM username matches an Agent.`
    : !hasActualChanges
      ? " Sync is idempotent (no fields change)."
      : base.changes.length > 0
        ? ` Sync will change ${base.changes.join(" and ")}.`
        : " Sync will update the form lead.";

  return {
    ...base,
    state: "conflict",
    matchCount,
    message: `Ambiguous fallback match: ${matchCount} form leads matched this phone/email. ${resolutionReason} Selected Vantage id ${current._id} for review.${changeNote}`,
  };
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "missing";
  return String(value);
}

const OWNER_VISIBLE_LOCATION_FIELDS = [
  "pickup_state",
  "delivery_state",
] as const;

function isNotFoundState(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "not_found";
}

function hasFormLeadChanges(
  row: FollowUpRow,
  current: FormLeadLookup,
  matchMethod: FormLeadMatchMethod,
): boolean {
  const intendedQuoted =
    matchMethod === "fallback"
      ? deriveQuotedFromPrior(row.prior)
      : row.quoted;
  const quoteChanged =
    isFormLeadPriorSyncable(row.prior) &&
    typeof intendedQuoted === "boolean" &&
    current.quoted !== intendedQuoted;
  const cubicChanged =
    isCubicFeetSyncable(row.prior) &&
    typeof row.cubicFeet === "number" &&
    current.cubic_feet !== row.cubicFeet;
  const locationChanged =
    Object.keys(
      buildFormLeadUpdatePayload(rowToSyncCandidate(row), current),
    ).length > 0;
  return quoteChanged || cubicChanged || locationChanged;
}
