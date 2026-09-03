import type { TariffAdjustmentParseResult } from "../../parsers/granot/tariff-adjustment";
import type {
  TariffAdjustmentApiRow,
  TariffAdjustmentRow,
  TariffAdjustmentSubmitPayload,
} from "./types";

export function isTariffAdjustmentComplete(
  result: TariffAdjustmentParseResult | undefined,
): boolean {
  return Boolean(
    result?.pageFound && result.missing.length === 0 && result.rows.length === 2,
  );
}

export function toTariffAdjustmentPayload(
  rows: TariffAdjustmentRow[],
): TariffAdjustmentSubmitPayload {
  return {
    rows: rows.map(toTariffAdjustmentApiRow),
  };
}

export function toTariffAdjustmentApiRow(
  row: TariffAdjustmentRow,
): TariffAdjustmentApiRow {
  return {
    effective_date: row.effectiveDate,
    pickup_zone: row.pickupZone,
    delivery_zone: row.deliveryZone,
    service: row.service,
    rule: row.rule,
    new_rule: row.newRule,
    carrier: row.carrier,
  };
}
