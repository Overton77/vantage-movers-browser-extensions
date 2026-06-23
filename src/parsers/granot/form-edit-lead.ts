// Current Form Lead (edit page) parser. Extracted verbatim from
// `entrypoints/granot-crm.content.ts` in Unit 03.
import { log } from "../../utils/logger";
import {
  MONGO_OBJECT_ID_RE,
  normalizeCellText,
  readPriorityLevel,
} from "./common";

export type CurrentFormLead = {
  id: string;
  refNo: string;
  prior: string;
  priorityLevel: number | undefined;
  quoted?: boolean;
  status: "syncable" | "invalid_ref_no" | "unsupported_prior" | "missing_prior";
  reason?: string;
  pageUrl: string;
};

export type CurrentFormLeadParseResult = {
  ok: true;
  pageFound: boolean;
  lead?: CurrentFormLead;
};

export type BindingEstimateFeeApplyResult = {
  ok: true;
  pageFound: boolean;
  updated: boolean;
  initialPrice?: string;
  previousFeeLabel?: string;
  previousFeeAmount?: string;
  feeAmount?: string;
  sourceField?: string;
  targetField?: string;
  labelField?: string;
  frameResponses?: number;
  frameCount?: number;
  message: string;
};

export function parseCurrentFormLead(
  root: Document,
  pageUrl: string,
): CurrentFormLeadParseResult {
  const refInput = root.querySelector<HTMLInputElement>(
    'form[name="theForm"] input[name="ORDREF"], input[name="ORDREF"]',
  );
  const looksLikeEditPage =
    pageUrl.includes("mpcharge~chargeswc") || Boolean(refInput);

  if (!looksLikeEditPage) {
    const result = {
      ok: true,
      pageFound: false,
    } satisfies CurrentFormLeadParseResult;
    log("No current form lead edit page found:", result);
    return result;
  }

  const refNo = normalizeCellText(refInput?.value ?? "");
  const priorityLevel = readPriorityLevel(root);
  const prior = typeof priorityLevel === "number" ? String(priorityLevel) : "";
  const baseLead = {
    id: `current:${refNo || "missing-ref"}`,
    refNo,
    prior,
    priorityLevel,
    pageUrl,
  };

  if (!MONGO_OBJECT_ID_RE.test(refNo)) {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "invalid_ref_no",
        reason: "Missing or invalid Mongo ObjectId in ORDREF field",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  if (typeof priorityLevel !== "number") {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "missing_prior",
        reason: "Missing Priority Level on form edit page",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  if (priorityLevel !== 0 && priorityLevel !== 1 && priorityLevel !== 5) {
    const result = {
      ok: true,
      pageFound: true,
      lead: {
        ...baseLead,
        status: "unsupported_prior",
        reason: "Only Priority Level 0, 1, and 5 are syncable without override",
      },
    } satisfies CurrentFormLeadParseResult;
    log("Parsed current form lead:", result);
    return result;
  }

  const result = {
    ok: true,
    pageFound: true,
    lead: {
      ...baseLead,
      status: "syncable",
      quoted: priorityLevel === 1 || priorityLevel === 5,
    },
  } satisfies CurrentFormLeadParseResult;
  log("Parsed current form lead:", result);
  return result;
}

export function applyBindingEstimateFeeFromInitialPrice(
  root: Document,
): BindingEstimateFeeApplyResult {
  const initialPriceInput = root.querySelector<HTMLInputElement>(
    'form[name="theForm"] input[name="I1TOTAL"], input[name="I1TOTAL"]',
  );
  const extraFeeFields = findFirstExtraFeeFields(root);

  const pageFound = Boolean(initialPriceInput || extraFeeFields);
  if (!pageFound) {
    return {
      ok: true,
      pageFound: false,
      updated: false,
      message:
        "No Initial Price or Extra fee fields were found on this frame.",
    };
  }

  if (!initialPriceInput) {
    return {
      ok: true,
      pageFound: true,
      updated: false,
      message: "Found Extra fee fields but could not find Initial Price field I1TOTAL.",
    };
  }

  if (!extraFeeFields) {
    return {
      ok: true,
      pageFound: true,
      updated: false,
      initialPrice: initialPriceInput.value,
      sourceField: initialPriceInput.name,
      message:
        "Found Initial Price but could not find the first Extra fee label and amount fields.",
    };
  }

  const { label: bindingEstimateLabel, amount: bindingEstimateAmount } =
    extraFeeFields;

  const initialPrice = parseCurrencyInput(initialPriceInput.value);
  if (initialPrice === undefined) {
    return {
      ok: true,
      pageFound: true,
      updated: false,
      initialPrice: initialPriceInput.value,
      sourceField: initialPriceInput.name,
      targetField: bindingEstimateAmount.name,
      labelField: bindingEstimateLabel.name,
      message: `Initial Price value "${initialPriceInput.value}" is not a valid number.`,
    };
  }

  const previousFeeLabel = bindingEstimateLabel.value;
  const previousFeeAmount = bindingEstimateAmount.value;
  const feeAmount = formatCurrency(initialPrice * 0.85);
  bindingEstimateLabel.value = "Binding Estimate Fee";
  bindingEstimateAmount.value = feeAmount;
  dispatchFieldUpdate(bindingEstimateLabel);
  dispatchFieldUpdate(bindingEstimateAmount);

  return {
    ok: true,
    pageFound: true,
    updated: true,
    initialPrice: formatCurrency(initialPrice),
    previousFeeLabel,
    previousFeeAmount,
    feeAmount,
    sourceField: initialPriceInput.name,
    targetField: bindingEstimateAmount.name,
    labelField: bindingEstimateLabel.name,
    message: `Wrote "Binding Estimate Fee" and ${formatCurrency(initialPrice)} × 85% = ${feeAmount}.`,
  };
}

function findFirstExtraFeeFields(
  root: Document,
): { label: HTMLInputElement; amount: HTMLInputElement } | undefined {
  const extraLabels = root.querySelectorAll<HTMLInputElement>(
    'input[name^="EXTRA"]:not([name$="AMT"])',
  );
  for (const label of extraLabels) {
    const amount = root.querySelector<HTMLInputElement>(
      `input[name="${label.name}AMT"]`,
    );
    if (amount) {
      return { label, amount };
    }
  }
  return undefined;
}

function parseCurrencyInput(value: string): number | undefined {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCurrency(value: number): string {
  return value.toFixed(2);
}

function dispatchFieldUpdate(input: HTMLInputElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
