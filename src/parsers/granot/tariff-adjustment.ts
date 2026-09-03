// Tariff-adjustment rows from a Granot Forms View page.
// Two append-only spreadsheet rows share pickup/delivery/carrier/date.
// Does not read customer name, phone, email, job number, or ref.
import { log } from "../../utils/logger";
import { normalizeCellText, parseGranotZip } from "./common";

export const TARIFF_SERVICES = ["Linehaul", "Additional Services"] as const;
export type TariffService = (typeof TARIFF_SERVICES)[number];

export type TariffAdjustmentRow = {
  effectiveDate: string;
  pickupZone: string;
  deliveryZone: string;
  service: TariffService;
  rule: string;
  newRule: string;
  carrier: string;
};

export type TariffAdjustmentParseResult = {
  pageFound: boolean;
  rows: TariffAdjustmentRow[];
  located: {
    pickupZone?: string;
    deliveryZone?: string;
    linehaulRule?: string;
    linehaulNewRule?: string;
    additionalServicesRule?: string;
    additionalServicesNewRule?: string;
    carrier?: string;
  };
  missing: string[];
};

export const TARIFF_ADJUSTMENT_REQUIRED_FIELDS = [
  "pickupZone",
  "deliveryZone",
  "linehaul.rule",
  "linehaul.newRule",
  "additionalServices.rule",
  "additionalServices.newRule",
  "carrier",
] as const;

export function emptyTariffAdjustmentParse(): TariffAdjustmentParseResult {
  return {
    pageFound: false,
    rows: [],
    located: {},
    missing: [...TARIFF_ADJUSTMENT_REQUIRED_FIELDS],
  };
}

const CITY_STATE_ZIP_RE = /,\s*[A-Z]{2}\s+(\d{5})(?:\D|$)/;
const INITIAL_PRICE_CF_RE = /(\d+(?:\.\d+)?)\s*cf\b/i;
const AGENT_LABEL_RE = /^Agent:\s*(.*)$/i;
const BINDING_ESTIMATE_FEE_RE = /^binding estimate fee$/i;
const MAPS_ZIP_RE = /[?&]q=(\d{5})\b/i;

export function parseTariffAdjustmentRows(
  root: Document,
  options: { now?: Date } = {},
): TariffAdjustmentParseResult {
  const pickupZone = readMoveZone(root, "Moving From") ?? readMapsZone(root, 0);
  const deliveryZone = readMoveZone(root, "Moving To") ?? readMapsZone(root, 1);
  const linehaulRule = readLinehaulCubicFeet(root);
  const linehaulNewRule = readLinehaulRate(root);
  const bindingEstimateFee = readBindingEstimateFee(root);
  const carrier = readAgentName(root);

  const pageFound = Boolean(
    pickupZone ||
      deliveryZone ||
      linehaulRule ||
      linehaulNewRule ||
      bindingEstimateFee ||
      carrier ||
      findRowWithFirstCell(root, /^Initial Price:/i) ||
      findRowWithFirstCell(root, /^Moving From$/i),
  );

  const located = {
    pickupZone,
    deliveryZone,
    linehaulRule,
    linehaulNewRule,
    additionalServicesRule: bindingEstimateFee?.rule,
    additionalServicesNewRule: bindingEstimateFee?.newRule,
    carrier,
  };

  const missing = [
    !pickupZone ? "pickupZone" : undefined,
    !deliveryZone ? "deliveryZone" : undefined,
    !linehaulRule ? "linehaul.rule" : undefined,
    !linehaulNewRule ? "linehaul.newRule" : undefined,
    !bindingEstimateFee?.rule ? "additionalServices.rule" : undefined,
    !bindingEstimateFee?.newRule ? "additionalServices.newRule" : undefined,
    !carrier ? "carrier" : undefined,
  ].filter((field): field is string => Boolean(field));

  if (!pageFound) {
    const result = emptyTariffAdjustmentParse();
    log("No tariff adjustment form found:", result);
    return result;
  }

  const shared = {
    effectiveDate: formatEffectiveDate(options.now ?? new Date()),
    pickupZone: pickupZone ?? "",
    deliveryZone: deliveryZone ?? "",
    carrier: carrier ?? "",
  };

  const rows: TariffAdjustmentRow[] = [
    {
      ...shared,
      service: "Linehaul",
      rule: linehaulRule ?? "",
      newRule: linehaulNewRule ?? "",
    },
    {
      ...shared,
      service: "Additional Services",
      rule: bindingEstimateFee?.rule ?? "",
      newRule: bindingEstimateFee?.newRule ?? "",
    },
  ];

  const result = { pageFound, rows, located, missing } satisfies TariffAdjustmentParseResult;
  log("Parsed tariff adjustment rows:", result);
  return result;
}

function readMoveZone(
  root: Document,
  heading: "Moving From" | "Moving To",
): string | undefined {
  const headerRow = findRowWithCellText(root, heading);
  const headerCell = headerRow
    ? [...headerRow.cells].find(
        (cell) => normalizeCellText(cell.textContent) === heading,
      )
    : undefined;
  if (!headerRow || !headerCell) {
    return undefined;
  }

  const columnIndex = [...headerRow.cells].indexOf(headerCell);
  const addressRow = nextElementRow(headerRow);
  const addressCell = addressRow?.cells[columnIndex];
  if (!addressCell) {
    return undefined;
  }

  return zipFromCityStateLine(normalizeCellText(addressCell.textContent));
}

function readMapsZone(root: Document, index: number): string | undefined {
  const zips = [...root.querySelectorAll("a[href]")]
    .map((anchor) => {
      const href = anchor.getAttribute("href") ?? "";
      const match = href.match(MAPS_ZIP_RE);
      return match ? parseGranotZip(match[1]) : undefined;
    })
    .filter((zip): zip is string => Boolean(zip));

  return zips[index];
}

function readLinehaulCubicFeet(root: Document): string | undefined {
  const row = findRowWithFirstCell(root, /^Initial Price:/i);
  if (!row) {
    return undefined;
  }

  const text = normalizeCellText(row.textContent);
  const match = text.match(INITIAL_PRICE_CF_RE);
  return match ? `${match[1]} cf` : undefined;
}

function readLinehaulRate(root: Document): string | undefined {
  const rateInput = root.querySelector<HTMLInputElement>(
    'form[name="theForm"] input[name="I1PERCFLBS"], input[name="I1PERCFLBS"]',
  );
  const amount = parseDecimal(rateInput?.value ?? "");
  if (amount === undefined) {
    return undefined;
  }

  const row = rateInput?.closest("tr") ?? findRowWithFirstCell(root, /^Initial Price:/i);
  const rowText = normalizeCellText(row?.textContent ?? "");
  if (rowText && !/\bper\s*cf\b/i.test(rowText)) {
    return undefined;
  }

  return `$${formatDecimal(amount)} per cf`;
}

function readBindingEstimateFee(
  root: Document,
): { rule: string; newRule: string } | undefined {
  const extraLabels = root.querySelectorAll<HTMLInputElement>(
    'input[name^="EXTRA"]:not([name$="AMT"])',
  );

  for (const label of extraLabels) {
    if (!BINDING_ESTIMATE_FEE_RE.test(normalizeCellText(label.value))) {
      continue;
    }

    const amountInput = root.querySelector<HTMLInputElement>(
      `input[name="${label.name}AMT"]`,
    );
    const amount = parseDecimal(amountInput?.value ?? "");
    if (amount === undefined) {
      return { rule: "Binding Estimate Fee", newRule: "" };
    }

    return {
      rule: "Binding Estimate Fee",
      newRule: `$${formatDecimal(amount)}`,
    };
  }

  return undefined;
}

function readAgentName(root: Document): string | undefined {
  const agentCell = [...root.querySelectorAll("td")].find((cell) => {
    const text = normalizeCellText(cell.textContent);
    return AGENT_LABEL_RE.test(text) && text.length < 120;
  });
  if (!agentCell) {
    return undefined;
  }

  const match = normalizeCellText(agentCell.textContent).match(AGENT_LABEL_RE);
  const name = match?.[1]?.trim();
  return name || undefined;
}

function zipFromCityStateLine(value: string): string | undefined {
  const match = value.match(CITY_STATE_ZIP_RE);
  return match ? parseGranotZip(match[1]) : undefined;
}

function findRowWithFirstCell(
  root: ParentNode,
  pattern: RegExp,
): HTMLTableRowElement | undefined {
  return [...root.querySelectorAll("tr")].find((row) =>
    pattern.test(normalizeCellText(row.cells[0]?.textContent ?? "")),
  );
}

function findRowWithCellText(
  root: ParentNode,
  value: string,
): HTMLTableRowElement | undefined {
  return [...root.querySelectorAll("tr")].find((row) =>
    [...row.cells].some((cell) => normalizeCellText(cell.textContent) === value),
  );
}

function nextElementRow(
  row: HTMLTableRowElement,
): HTMLTableRowElement | undefined {
  let sibling = row.nextElementSibling;
  while (sibling && sibling.tagName !== "TR") {
    sibling = sibling.nextElementSibling;
  }
  return sibling instanceof HTMLTableRowElement ? sibling : undefined;
}

function parseDecimal(value: string): number | undefined {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDecimal(value: number): string {
  return value.toFixed(2);
}

function formatEffectiveDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
