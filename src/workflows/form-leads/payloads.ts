// Pure helpers that turn parsed Form Lead rows into Vantage API payloads and
// human-readable result messages. No DOM, tabs, or messaging dependencies.
import type { FormLeadLookup, FormLeadUpdatePayload } from "../../utils/api";
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

/** True when a row has a valid ref_no and prior 1/5 (direct Mongo id sync). */
export function isDirectFormLeadRowSyncable(row: FollowUpRow): boolean {
  return isSyncableRow(row) && isFormLeadPriorSyncable(row.prior);
}

/** True when a row can be synced either by direct id or by a confident fallback match. */
export function isRowSyncable(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): boolean {
  if (!isFormLeadPriorSyncable(row.prior)) {
    return false;
  }
  return isSyncableRow(row) || isFallbackSyncable(row, preview);
}

export function rowToSyncCandidate(
  row: FollowUpRow,
  preview?: FormLeadRowPreview,
): LeadSyncCandidate {
  const isFallback = preview?.matchMethod === "phone_and_email";
  const quoted = isFallback
    ? row.quoted ?? deriveQuotedFromPrior(row.prior)
    : row.quoted;
  return {
    id: row.id,
    refNo: row.refNo,
    prior: row.prior,
    quoted,
    cubicFeet: isCubicFeetSyncable(row.prior) ? row.cubicFeet : undefined,
    salesRepRaw: row.salesRepRaw,
    status: row.status,
    vantageId: isFallback ? preview?.resolvedVantageId : row.refNo,
  };
}

export function buildFormLeadUpdatePayload(
  candidate: LeadSyncCandidate,
  current: { quoted?: boolean; cubic_feet?: number },
): FormLeadUpdatePayload {
  const payload: FormLeadUpdatePayload = {};
  if (current.quoted !== candidate.quoted) {
    payload.quoted = candidate.quoted;
  }
  const cubicFeet = resolveSyncableCubicFeet(candidate);
  if (cubicFeet !== undefined && current.cubic_feet !== cubicFeet) {
    payload.cubic_feet = cubicFeet;
  }
  return payload;
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
  const parts = [`Already quoted=${candidate.quoted}`];
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
