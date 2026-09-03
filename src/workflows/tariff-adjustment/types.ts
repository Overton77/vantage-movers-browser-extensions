import type {
  TariffAdjustmentParseResult,
  TariffAdjustmentRow,
  TariffService,
} from "../../parsers/granot/tariff-adjustment";

export type {
  TariffAdjustmentParseResult,
  TariffAdjustmentRow,
  TariffService,
};

export type TariffAdjustmentApiRow = {
  effective_date: string;
  pickup_zone: string;
  delivery_zone: string;
  service: TariffService;
  rule: string;
  new_rule: string;
  carrier: string;
};

export type TariffAdjustmentSubmitPayload = {
  rows: TariffAdjustmentApiRow[];
};

export type TariffAdjustmentSubmitResult = {
  appended: number;
  tab_name: string;
  updated_range?: string;
  rows: string[][];
};
