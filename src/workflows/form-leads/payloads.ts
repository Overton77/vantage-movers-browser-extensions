// Pure helpers that turn parsed Form Lead rows into Vantage API payloads and
// human-readable result messages. No DOM, tabs, or messaging dependencies.
import type { FormLeadLookup, FormLeadUpdatePayload } from "../../utils/api";
import {
  parseGranotCityState,
  parseGranotZip,
} from "../../parsers/granot/common";
import type {
  FollowUpRow,
  FormLeadRowPreview,
  LeadSyncCandidate,
} from "./types";

export function isSyncableRow(row: FollowUpRow): boolean {
  return row.status === "syncable" && typeof row.quoted === "boolean";
}

/** Duplicate quarantine leads must never be previewed or synced by Mongo id. */
export function isDuplicateQuarantineLead(
  lead?: Pick<FormLeadLookup, "duplicate"> | null,
): boolean {
  return lead?.duplicate === true;
}

/**
 * A row that failed direct id resolution (`invalid_ref_no`) but still carries a
 * phone or email is eligible for fallback search against Vantage. Such rows are
 * previewed even though they are not directly syncable.
 */
export function isFallbackEligible(row: FollowUpRow): boolean {
  return (
    row.status === "invalid_ref_no" && (Boolean(row.phone) || Boolean(row.email))
  );
}

/**
 * Derives the intended `quoted` value from a Granot `prior` value using the same
 * rule as the parser (`0 -> false`, `1` / `5 -> true`). Returns `undefined` for
 * unsupported prior values so callers can refuse to sync them. Used for fallback
 * rows whose parsed `quoted` is undefined because they were marked invalid_ref_no.
 */
export function deriveQuotedFromPrior(prior: string): boolean | undefined {
  if (prior === "0") return false;
  if (prior === "1" || prior === "5") return true;
  return undefined;
}

/**
 * Form lead rows are only eligible for Vantage sync when Granot `prior` is `1`
 * or `5` (quoted / booked). Prior `0` means not quoted — the est_cf default and
 * quoted=false must not be pushed to Vantage.
 */
export function isFormLeadPriorSyncable(prior: string): boolean {
  return prior === "1" || prior === "5";
}

/**
 * `cubic_feet` is only authoritative when the Granot `prior` is `1` or `5`.
 * For `prior === "0"` the CRM column carries a default placeholder value that
 * must never be propagated to Vantage.
 */
export function isCubicFeetSyncable(prior: string): boolean {
  return isFormLeadPriorSyncable(prior);
}

/** Returns the cubic feet value to sync, or undefined when prior blocks it. */
export function resolveSyncableCubicFeet(
  candidate: Pick<LeadSyncCandidate, "prior" | "cubicFeet">,
): number | undefined {
  if (typeof candidate.cubicFeet !== "number") return undefined;
  if (candidate.prior !== undefined && !isCubicFeetSyncable(candidate.prior)) {
    return undefined;
  }
  return candidate.cubicFeet;
}

/**
 * A fallback row is safe to sync only when search recovered exactly one Vantage
 * lead (`found_by_fallback` with a resolved id) and the Granot `prior` maps to a
 * supported `quoted` value. Conflict / not-found / error previews are excluded.
 */
export function isFallbackSyncable(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): boolean {
  return (
    !!preview &&
    preview.matchMethod === "phone_and_email" &&
    !!preview.resolvedVantageId &&
    deriveQuotedFromPrior(row.prior) !== undefined &&
    (preview.state === "found_by_fallback" || preview.state === "conflict")
  );
}

/** True when Vantage found a lead that can receive receiver_agent enrichment. */
export function isReceiverAgentEnrichmentSyncable(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): boolean {
  return Boolean(
    row.salesRepRaw?.trim() &&
      preview?.matchMethod !== "none" &&
      (preview?.resolvedVantageId || preview?.current?._id),
  );
}

/** True when a row has a valid ref_no and prior 1/5 (direct Mongo id sync). */
export function isDirectFormLeadRowSyncable(row: FollowUpRow): boolean {
  return isSyncableRow(row) && isFormLeadPriorSyncable(row.prior);
}

/**
 * True when a row can be synced either by quote/cubic rules or by receiver_agent
 * enrichment against a Vantage lead found during preview.
 */
export function isRowSyncable(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): boolean {
  const fieldSyncable =
    isFormLeadPriorSyncable(row.prior) &&
    (isSyncableRow(row) || isFallbackSyncable(row, preview));
  return fieldSyncable || isReceiverAgentEnrichmentSyncable(row, preview);
}

/** Selected rows that are eligible for sync (used by Sync Selected and auto-sync). */
export function filterSelectedSyncableRows(
  rows: FollowUpRow[],
  selectedRowIds: ReadonlySet<string>,
  previews: ReadonlyMap<string, FormLeadRowPreview>,
): FollowUpRow[] {
  return rows.filter(
    (row) =>
      selectedRowIds.has(row.id) &&
      isRowSyncable(row, previews.get(row.id)),
  );
}

export function rowToSyncCandidate(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): LeadSyncCandidate {
  const isFallback = preview?.matchMethod === "phone_and_email";
  const canSyncLeadFields = isFormLeadPriorSyncable(row.prior);
  const pickupLocation = parseGranotCityState(row.from);
  const deliveryLocation = parseGranotCityState(row.to);
  const pickupZip = parseGranotZip(row.fromZip);
  const deliveryZip = parseGranotZip(row.toZip);
  const quoted = canSyncLeadFields
    ? isFallback
      ? row.quoted ?? deriveQuotedFromPrior(row.prior)
      : row.quoted
    : undefined;
  return {
    id: row.id,
    refNo: row.refNo,
    prior: row.prior,
    quoted,
    cubicFeet: canSyncLeadFields && isCubicFeetSyncable(row.prior) ? row.cubicFeet : undefined,
    pickupCity: canSyncLeadFields ? pickupLocation?.city : undefined,
    pickupState:
      canSyncLeadFields && pickupLocation && pickupZip
        ? pickupLocation.state
        : undefined,
    pickupZip:
      canSyncLeadFields && pickupLocation && pickupZip ? pickupZip : undefined,
    deliveryCity: canSyncLeadFields ? deliveryLocation?.city : undefined,
    deliveryState:
      canSyncLeadFields && deliveryLocation && deliveryZip
        ? deliveryLocation.state
        : undefined,
    deliveryZip:
      canSyncLeadFields && deliveryLocation && deliveryZip
        ? deliveryZip
        : undefined,
    salesRepRaw: row.salesRepRaw,
    status: row.status,
    vantageId: preview?.resolvedVantageId ?? row.refNo,
  };
}

export function buildFormLeadUpdatePayload(
  candidate: LeadSyncCandidate,
  current: Partial<FormLeadLookup>,
): FormLeadUpdatePayload {
  const payload: FormLeadUpdatePayload = {};
  if (typeof candidate.quoted === "boolean" && current.quoted !== candidate.quoted) {
    payload.quoted = candidate.quoted;
  }
  const cubicFeet = resolveSyncableCubicFeet(candidate);
  if (cubicFeet !== undefined && current.cubic_feet !== cubicFeet) {
    payload.cubic_feet = cubicFeet;
  }
  if (candidate.pickupCity && isMissingCity(current.pickup_city)) {
    payload.pickup_city = candidate.pickupCity;
  }
  if (
    candidate.pickupZip &&
    isMissingZip(current.pickup_zip) &&
    (isMissingState(current.pickup_state) ||
      statesMatch(current.pickup_state, candidate.pickupState))
  ) {
    payload.pickup_zip = candidate.pickupZip;
  }
  if (
    candidate.pickupState &&
    isMissingState(current.pickup_state) &&
    (isMissingZip(current.pickup_zip) ||
      current.pickup_zip?.trim() === candidate.pickupZip)
  ) {
    payload.pickup_state = candidate.pickupState;
  }
  if (candidate.deliveryCity && isMissingCity(current.delivery_city)) {
    payload.delivery_city = candidate.deliveryCity;
  }
  if (
    candidate.deliveryZip &&
    isMissingZip(current.destination_zip) &&
    (isMissingState(current.delivery_state) ||
      statesMatch(current.delivery_state, candidate.deliveryState))
  ) {
    payload.destination_zip = candidate.deliveryZip;
  }
  if (
    candidate.deliveryState &&
    isMissingState(current.delivery_state) &&
    (isMissingZip(current.destination_zip) ||
      current.destination_zip?.trim() === candidate.deliveryZip)
  ) {
    payload.delivery_state = candidate.deliveryState;
  }
  return payload;
}

function isMissingCity(value?: string | null): boolean {
  return !value?.trim();
}

function isMissingZip(value?: string | null): boolean {
  const normalized = value?.trim();
  return !normalized || /^0+$/.test(normalized);
}

function isMissingState(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase();
  return !normalized || normalized === "," || normalized === "not_found";
}

function statesMatch(current?: string | null, candidate?: string): boolean {
  return Boolean(
    candidate && current?.trim().toUpperCase() === candidate.toUpperCase(),
  );
}

export function buildFormLeadSyncPayload(
  candidate: LeadSyncCandidate,
): FormLeadUpdatePayload {
  const payload: FormLeadUpdatePayload = {};
  if (typeof candidate.quoted === "boolean") {
    payload.quoted = candidate.quoted;
  }
  const cubicFeet = resolveSyncableCubicFeet(candidate);
  if (cubicFeet !== undefined) {
    payload.cubic_feet = cubicFeet;
  }
  return payload;
}

export function buildUnchangedMessage(candidate: LeadSyncCandidate): string {
  const parts =
    typeof candidate.quoted === "boolean"
      ? [`Already quoted=${candidate.quoted}`]
      : ["No quote/cubic update available"];
  const cubicFeet = resolveSyncableCubicFeet(candidate);
  if (cubicFeet !== undefined) {
    parts.push(`cubic_feet=${cubicFeet}`);
  }
  return parts.join(", ");
}

export function buildUpdatedMessage(payload: FormLeadUpdatePayload): string {
  return Object.entries(payload)
    .map(([field, value]) => `Updated ${field}=${value}`)
    .join(", ");
}
