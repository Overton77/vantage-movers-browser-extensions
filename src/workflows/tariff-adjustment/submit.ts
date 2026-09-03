import { submitTariffAdjustments } from "../../api/tariffAdjustments";
import { toTariffAdjustmentPayload } from "./preview";
import type {
  TariffAdjustmentRow,
  TariffAdjustmentSubmitResult,
} from "./types";

export async function submitTariffAdjustmentRows(
  rows: TariffAdjustmentRow[],
): Promise<TariffAdjustmentSubmitResult> {
  return submitTariffAdjustments(toTariffAdjustmentPayload(rows));
}
