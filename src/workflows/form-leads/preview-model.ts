// Builds the pre-sync "preview" model for a Form Lead row by comparing the
// parsed Granot row against the current Vantage form lead. Pure / UI-free: the
// popup turns the returned `state` + `message` into badges and copy.
import type { FormLeadLookup } from "../../utils/api";
import type { FollowUpRow, FormLeadRowPreview } from "./types";

export function buildFormLeadRowPreview(
  row: FollowUpRow,
  current: FormLeadLookup,
): FormLeadRowPreview {
  const hasBooking = Boolean(current.booked);
  const quotedDiffers =
    typeof row.quoted === "boolean" && current.quoted !== row.quoted;
  const cubicDiffers =
    typeof row.cubicFeet === "number" && current.cubic_feet !== row.cubicFeet;
  const changes: string[] = [];
  if (quotedDiffers) {
    changes.push(`quoted ${formatValue(current.quoted)} → ${row.quoted}`);
  }
  if (cubicDiffers) {
    changes.push(
      `cubic_feet ${formatValue(current.cubic_feet)} → ${row.cubicFeet}`,
    );
  }

  if (hasBooking) {
    return {
      state: "has_booking",
      current,
      changes,
      message:
        changes.length === 0
          ? `Found form lead by ref_no; it has a booking attached (booking ${String(current.booked)}). Running sync is idempotent (no fields change).`
          : `Found form lead by ref_no; it has a booking attached (booking ${String(current.booked)}). Running sync will refresh ${changes.join(", ")} on the form lead. The booking link is preserved.`,
    };
  }

  if (changes.length === 0) {
    return {
      state: "idempotent",
      current,
      changes,
      message:
        "Found form lead by ref_no. No booking attached and quoted + cubic_feet already match the Granot row — sync is idempotent.",
    };
  }

  return {
    state: "will_update",
    current,
    changes,
    message: `Found form lead by ref_no. No booking attached. Sync will change ${changes.join(" and ")}.`,
  };
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "missing";
  return String(value);
}
