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
