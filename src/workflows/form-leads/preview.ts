import type {
  GranotFormLeadMatchBody,
  GranotFormLeadMatchResult,
} from "../../utils/api";
import { mapWithConcurrency } from "../../utils/concurrency";
import { buildFormLeadRowPreview } from "./preview-model";
import type { FollowUpRow, FormLeadRowPreview } from "./types";

export type FormLeadPreviewContext = {
  resolveGranotFormLead: (
    body: GranotFormLeadMatchBody,
  ) => Promise<GranotFormLeadMatchResult>;
};

export type FormLeadPreviewOptions = {
  concurrency?: number;
};

export const DEFAULT_PREVIEW_CONCURRENCY = 4;

export async function previewFormLeadRows(
  rows: FollowUpRow[],
  context: FormLeadPreviewContext,
  options: FormLeadPreviewOptions = {},
): Promise<Map<string, FormLeadRowPreview>> {
  const previews = new Map<string, FormLeadRowPreview>();
  const targets = rows.filter(hasMatchInput);
  const concurrency = options.concurrency ?? DEFAULT_PREVIEW_CONCURRENCY;
  const resolved = await mapWithConcurrency(targets, concurrency, (row) =>
    previewRow(row, context),
  );
  targets.forEach((row, index) => previews.set(row.id, resolved[index]));
  return previews;
}

async function previewRow(
  row: FollowUpRow,
  context: FormLeadPreviewContext,
): Promise<FormLeadRowPreview> {
  try {
    const result = await context.resolveGranotFormLead({
      ...(row.refNo.trim() ? { ref_no: row.refNo } : {}),
      ...(row.phone ? { phone_number: row.phone } : {}),
      ...(row.email ? { email: row.email } : {}),
      ...(row.customer ? { name: row.customer } : {}),
      source_label: row.source?.trim() ?? "",
      ...(row.prior ? { prior: row.prior } : {}),
    });
    return previewFromMatch(row, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      state: "preview_error",
      changes: [],
      matchMethod: "none",
      message: `Could not resolve this Granot row against Vantage: ${message}`,
      error: message,
    };
  }
}

function previewFromMatch(
  row: FollowUpRow,
  result: GranotFormLeadMatchResult,
): FormLeadRowPreview {
  if (result.status === "found") {
    const preview = buildFormLeadRowPreview(
      row,
      result.lead,
      result.match_method,
    );
    return {
      ...preview,
      matchCount: result.candidate_count,
      warnings: result.warnings,
      message: appendWarnings(preview.message, result.warnings),
    };
  }
  if (result.status === "conflict") {
    return {
      state: "conflict",
      changes: [],
      matchMethod: "none",
      matchCount: result.candidate_count,
      warnings: result.warnings,
      message: appendWarnings(
        `Vantage could not select one form lead: ${result.reason}`,
        result.warnings,
      ),
    };
  }
  return {
    state: "not_found",
    changes: [],
    matchMethod: "none",
    matchCount: result.candidate_count,
    warnings: result.warnings,
    message: appendWarnings(result.reason, result.warnings),
  };
}

function hasMatchInput(row: FollowUpRow): boolean {
  return Boolean(
    row.source?.trim() &&
      (row.refNo.trim() || row.phone || row.email || row.customer),
  );
}

function appendWarnings(message: string, warnings: string[]): string {
  return warnings.length > 0
    ? `${message} Warning: ${warnings.join(" ")}`
    : message;
}
