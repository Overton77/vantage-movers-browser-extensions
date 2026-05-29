// Pure helpers that turn parsed Form Lead rows into Vantage API payloads and
// human-readable result messages. No DOM, tabs, or messaging dependencies.
import type { FormLeadUpdatePayload } from "../../utils/api";
import type { FollowUpRow, LeadSyncCandidate } from "./types";

export function isSyncableRow(row: FollowUpRow): boolean {
  return row.status === "syncable" && typeof row.quoted === "boolean";
}

export function rowToSyncCandidate(row: FollowUpRow): LeadSyncCandidate {
  return {
    id: row.id,
    refNo: row.refNo,
    quoted: row.quoted,
    cubicFeet: row.cubicFeet,
    status: row.status,
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
  if (
    typeof candidate.cubicFeet === "number" &&
    current.cubic_feet !== candidate.cubicFeet
  ) {
    payload.cubic_feet = candidate.cubicFeet;
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
  if (typeof candidate.cubicFeet === "number") {
    payload.cubic_feet = candidate.cubicFeet;
  }
  return payload;
}

export function buildUnchangedMessage(candidate: LeadSyncCandidate): string {
  const parts = [`Already quoted=${candidate.quoted}`];
  if (typeof candidate.cubicFeet === "number") {
    parts.push(`cubic_feet=${candidate.cubicFeet}`);
  }
  return parts.join(", ");
}

export function buildUpdatedMessage(payload: FormLeadUpdatePayload): string {
  return Object.entries(payload)
    .map(([field, value]) => `Updated ${field}=${value}`)
    .join(", ");
}
