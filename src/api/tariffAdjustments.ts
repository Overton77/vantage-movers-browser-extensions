import { vantageFetch } from "./client";
import type {
  TariffAdjustmentSubmitPayload,
  TariffAdjustmentSubmitResult,
} from "../workflows/tariff-adjustment/types";

export async function submitTariffAdjustments(
  payload: TariffAdjustmentSubmitPayload,
): Promise<TariffAdjustmentSubmitResult> {
  const envelope = await vantageFetch<TariffAdjustmentSubmitResult>(
    "/api/v1/tariff-adjustments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return envelope.data;
}