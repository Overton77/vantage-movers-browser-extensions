import { describe, expect, it, vi } from "vitest";
import type {
  FormLeadLookup,
  GranotFormLeadMatchBody,
  GranotFormLeadMatchResult,
} from "../utils/api";
import { previewFormLeadRows } from "../workflows/form-leads/preview";
import type { FollowUpRow } from "../workflows/form-leads/types";

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    source: "Top10 Forms",
    refNo: "Mob_t3ePdBDVFn",
    prior: "1",
    status: "syncable",
    quoted: true,
    cubicFeet: 300,
    customer: "Jane Customer",
    phone: "5551234567",
    email: "jane@example.com",
    ...overrides,
  };
}

function makeLookup(overrides: Partial<FormLeadLookup> = {}): FormLeadLookup {
  return {
    _id: "lead-id",
    ref_no: "Mob_t3ePdBDVFn",
    source_company: "top10_leads",
    quoted: true,
    cubic_feet: 300,
    booked: null,
    ...overrides,
  };
}

function found(
  match_method: "ref_no_exact" | "mongo_id" | "fallback",
  lead: FormLeadLookup = makeLookup(),
  warnings: string[] = [],
): GranotFormLeadMatchResult {
  return {
    status: "found",
    match_method,
    lead,
    candidate_count: 1,
    warnings,
  };
}

describe("previewFormLeadRows", () => {
  it("sends the complete Granot identity context to the authoritative resolver", async () => {
    const resolveGranotFormLead = vi.fn(
      async (_body: GranotFormLeadMatchBody) => found("ref_no_exact"),
    );
    const previews = await previewFormLeadRows(
      [makeRow()],
      { resolveGranotFormLead },
    );

    expect(resolveGranotFormLead).toHaveBeenCalledWith({
      ref_no: "Mob_t3ePdBDVFn",
      phone_number: "5551234567",
      email: "jane@example.com",
      name: "Jane Customer",
      source_label: "Top10 Forms",
      prior: "1",
    });
    expect(previews.get("row-1")?.matchMethod).toBe("ref_no_exact");
    expect(previews.get("row-1")?.resolvedVantageId).toBe("lead-id");
  });

  it.each([
    ["ref_no_exact", "exact ref_no"],
    ["mongo_id", "Mongo id"],
  ] as const)("distinguishes %s direct matches in owner copy", async (method, copy) => {
    const previews = await previewFormLeadRows([makeRow()], {
      resolveGranotFormLead: async () => found(method),
    });
    expect(previews.get("row-1")?.message).toContain(copy);
  });

  it("marks a source-gated fallback as found_by_fallback", async () => {
    const previews = await previewFormLeadRows(
      [makeRow({ refNo: "", source: "TBM Forms" })],
      {
        resolveGranotFormLead: async () =>
          found(
            "fallback",
            makeLookup({
              _id: "tbm-id",
              ref_no: "tz-provider-ref",
              source_company: "tbm_leads",
              quoted: false,
            }),
          ),
      },
    );
    const preview = previews.get("row-1");
    expect(preview?.state).toBe("found_by_fallback");
    expect(preview?.matchMethod).toBe("fallback");
    expect(preview?.resolvedVantageId).toBe("tbm-id");
  });

  it("blocks conflict and no-match resolver outcomes", async () => {
    const rows = [
      makeRow({ id: "conflict" }),
      makeRow({ id: "missing", refNo: "" }),
    ];
    const previews = await previewFormLeadRows(rows, {
      resolveGranotFormLead: async (body) =>
        body.ref_no
          ? {
              status: "conflict",
              match_method: "none",
              candidate_count: 2,
              reason: "duplicate_exact_ref",
              warnings: [],
            }
          : {
              status: "no_match",
              match_method: "none",
              candidate_count: 1,
              reason: "No same-source FormLead matched phone, email, or name.",
              warnings: [],
            },
    });
    expect(previews.get("conflict")?.state).toBe("conflict");
    expect(previews.get("missing")?.state).toBe("not_found");
    expect(previews.get("missing")?.resolvedVantageId).toBeUndefined();
  });

  it("surfaces exact-identity source warnings without blocking the match", async () => {
    const warning =
      'Exact identity matched source_company "tbm_leads" while Granot source "Top10 Forms" maps to "top10_leads".';
    const previews = await previewFormLeadRows([makeRow()], {
      resolveGranotFormLead: async () =>
        found(
          "ref_no_exact",
          makeLookup({ source_company: "tbm_leads" }),
          [warning],
        ),
    });
    expect(previews.get("row-1")?.warnings).toEqual([warning]);
    expect(previews.get("row-1")?.message).toContain("Warning:");
  });

  it("isolates resolver failures per row", async () => {
    const previews = await previewFormLeadRows([makeRow()], {
      resolveGranotFormLead: async () => {
        throw new Error("network exploded");
      },
    });
    expect(previews.get("row-1")?.state).toBe("preview_error");
    expect(previews.get("row-1")?.message).toContain("network exploded");
  });
});
