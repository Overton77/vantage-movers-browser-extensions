import { describe, expect, it } from "vitest";

import type { FormLeadLookup, FormLeadSearchResult } from "../utils/api";
import { previewFormLeadRows } from "../workflows/form-leads/preview";
import type { FollowUpRow } from "../workflows/form-leads/types";

const NO_SEARCH_RESULT: FormLeadSearchResult = {
  status: "not_found",
  found: false,
  message: "no match",
  matches: [],
};

async function notFoundSearch(): Promise<FormLeadSearchResult> {
  return NO_SEARCH_RESULT;
}

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    refNo: "6a1743a401a95dbdc5bd8797",
    prior: "1",
    status: "syncable",
    quoted: true,
    cubicFeet: 300,
    ...overrides,
  };
}

function makeLookup(overrides: Partial<FormLeadLookup> = {}): FormLeadLookup {
  return {
    _id: "lead",
    ref_no: "lead",
    quoted: true,
    cubic_feet: 300,
    booked: null,
    ...overrides,
  };
}

function lookupTable(
  table: Record<string, FormLeadLookup>,
  searchFormLeads: () => Promise<FormLeadSearchResult> = notFoundSearch,
) {
  return {
    getFormLeadById: async (id: string) => {
      const lead = table[id];
      if (!lead) {
        throw new Error("Form lead not found");
      }
      return lead;
    },
    searchFormLeads,
  };
}

describe("previewFormLeadRows", () => {
  it("returns will_update / idempotent / has_booking states per row", async () => {
    const rows = [
      makeRow({ id: "will", refNo: "will", quoted: false, cubicFeet: 200 }),
      makeRow({ id: "idem", refNo: "idem", quoted: true, cubicFeet: 300 }),
      makeRow({ id: "booked", refNo: "booked", quoted: true, cubicFeet: 450 }),
    ];

    const previews = await previewFormLeadRows(
      rows,
      lookupTable({
        will: makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
        idem: makeLookup({ quoted: true, cubic_feet: 300, booked: null }),
        booked: makeLookup({ quoted: false, cubic_feet: 300, booked: "b-1" }),
      }),
    );

    expect(previews.get("will")?.state).toBe("will_update");
    expect(previews.get("idem")?.state).toBe("idempotent");
    expect(previews.get("booked")?.state).toBe("has_booking");
  });

  it("captures a 404-like lookup as not_found without failing the batch", async () => {
    const rows = [
      makeRow({ id: "ok", refNo: "ok" }),
      makeRow({ id: "missing", refNo: "missing" }),
    ];

    const previews = await previewFormLeadRows(
      rows,
      lookupTable({ ok: makeLookup() }),
    );

    expect(previews.get("ok")?.state).toBe("idempotent");
    expect(previews.get("missing")?.state).toBe("not_found");
    expect(previews.get("missing")?.error).toContain("not found");
  });

  it("records a preview_error for non-404 failures", async () => {
    const previews = await previewFormLeadRows([makeRow({ id: "boom" })], {
      getFormLeadById: async () => {
        throw new Error("network exploded");
      },
      searchFormLeads: notFoundSearch,
    });

    expect(previews.get("boom")?.state).toBe("preview_error");
    expect(previews.get("boom")?.message).toContain("network exploded");
  });

  it("skips rows that have neither a valid id nor fallback fields", async () => {
    const previews = await previewFormLeadRows(
      [
        makeRow({ id: "skip", refNo: "not-an-id", status: "invalid_ref_no" }),
        makeRow({
          id: "skip-2",
          refNo: "not-an-id",
          status: "missing_prior",
          quoted: undefined,
        }),
      ],
      lookupTable({}),
    );

    expect(previews.size).toBe(0);
  });

  it("previews unsupported-priority rows when the ref_no resolves", async () => {
    const previews = await previewFormLeadRows(
      [
        makeRow({
          id: "unsupported",
          prior: "2",
          status: "unsupported_prior",
          quoted: undefined,
          salesRepRaw: "MIKEM",
        }),
      ],
      lookupTable({
        "6a1743a401a95dbdc5bd8797": makeLookup({
          _id: "6a1743a401a95dbdc5bd8797",
        }),
      }),
    );

    const preview = previews.get("unsupported");
    expect(preview?.state).toBe("idempotent");
    expect(preview?.resolvedVantageId).toBe("6a1743a401a95dbdc5bd8797");
    expect(preview?.message).toContain("receiver_agent");
  });

  it("recovers an invalid-ref_no row by phone + email (found_by_fallback)", async () => {
    const row = makeRow({
      id: "fallback",
      refNo: "Mob_t3ePdBDVFn",
      status: "invalid_ref_no",
      quoted: undefined,
      prior: "1",
      phone: "5551234567",
      email: "a@b.com",
    });

    const previews = await previewFormLeadRows(
      [row],
      lookupTable({}, async () => ({
        status: "found",
        found: true,
        message: "found",
        matches: [
          { _id: "resolved-id", quoted: false, cubic_feet: 100, booked: null },
        ],
        lead: { _id: "resolved-id", quoted: false, cubic_feet: 100, booked: null },
      })),
    );

    const preview = previews.get("fallback");
    expect(preview?.state).toBe("found_by_fallback");
    expect(preview?.matchMethod).toBe("phone_and_email");
    expect(preview?.resolvedVantageId).toBe("resolved-id");
  });

  it("preserves receiver agent snapshots from fallback search results", async () => {
    const row = makeRow({
      id: "fallback-with-receiver",
      refNo: "not provided",
      status: "invalid_ref_no",
      quoted: undefined,
      prior: "5",
      phone: "+16102131384",
      email: "sperrot65@yahoo.com",
      salesRepRaw: "PATRICKO",
    });

    const previews = await previewFormLeadRows(
      [row],
      lookupTable({}, async () => ({
        status: "found",
        found: true,
        message: "found",
        matches: [
          {
            _id: "6a4158eef9791e088864606f",
            quoted: true,
            cubic_feet: 300,
            booked: "booking-1",
            receiver_agent: "agent-patrick",
            receiver_agent_name_snapshot: "Patrick",
            receiver_agent_source: "manual",
            receiver_agent_source_value: "Patrick",
          },
        ],
        lead: {
          _id: "6a4158eef9791e088864606f",
          quoted: true,
          cubic_feet: 300,
          booked: "booking-1",
          receiver_agent: "agent-patrick",
          receiver_agent_name_snapshot: "Patrick",
          receiver_agent_source: "manual",
          receiver_agent_source_value: "Patrick",
        },
      })),
    );

    const preview = previews.get("fallback-with-receiver");
    expect(preview?.state).toBe("found_by_fallback");
    expect(preview?.current?.receiver_agent).toBe("agent-patrick");
    expect(preview?.current?.receiver_agent_name_snapshot).toBe("Patrick");
  });

  it("marks more than one fallback match as a conflict", async () => {
    const row = makeRow({
      id: "conflict",
      refNo: "not-an-id",
      status: "invalid_ref_no",
      quoted: undefined,
      phone: "5551234567",
      email: "a@b.com",
    });

    const previews = await previewFormLeadRows(
      [row],
      lookupTable({}, async () => ({
        status: "found",
        found: true,
        message: "found",
        matches: [
          { _id: "one", booked: null },
          { _id: "two", booked: null },
        ],
      })),
    );

    const preview = previews.get("conflict");
    expect(preview?.state).toBe("conflict");
    expect(preview?.matchCount).toBe(2);
    expect(preview?.resolvedVantageId).toBeUndefined();
  });

  it("resolves a conflict when ref_no isolates one fallback match", async () => {
    const row = makeRow({
      id: "resolved-conflict",
      refNo: "Mob_9qWT0DMsNt",
      status: "invalid_ref_no",
      quoted: undefined,
      prior: "1",
      phone: "+16086211565",
      email: "kierresales@gmail.com",
      source: "Top10 Forms",
    });

    const previews = await previewFormLeadRows(
      [row],
      lookupTable({}, async () => ({
        status: "found",
        found: true,
        message: "found",
        matches: [
          {
            _id: "top10-id",
            ref_no: "Mob_9qWT0DMsNt",
            source_company: "top10_leads",
            quoted: false,
            cubic_feet: 100,
            booked: null,
          },
          {
            _id: "tbm-id",
            ref_no: "stf6cce70740684257be5e0f1094846243",
            source_company: "tbm_leads",
            quoted: false,
            cubic_feet: 100,
            booked: null,
          },
        ],
      })),
    );

    const preview = previews.get("resolved-conflict");
    expect(preview?.state).toBe("conflict");
    expect(preview?.matchCount).toBe(2);
    expect(preview?.resolvedVantageId).toBe("top10-id");
    expect(preview?.message).toContain("Ambiguous fallback match");
    expect(preview?.message).toContain("top10-id");
  });

  it("falls back when a direct id resolves to a duplicate quarantine lead", async () => {
    const row = makeRow({
      id: "dup-id",
      refNo: "6a19ddd4bf20b878123aac14",
      phone: "5551234567",
      email: "a@b.com",
    });

    const previews = await previewFormLeadRows(
      [row],
      {
        getFormLeadById: async () =>
          makeLookup({
            _id: "6a19ddd4bf20b878123aac14",
            duplicate: true,
          }),
        searchFormLeads: async () => ({
          status: "found",
          found: true,
          message: "found",
          matches: [{ _id: "canonical-id", quoted: true, cubic_feet: 300, booked: null }],
          lead: { _id: "canonical-id", quoted: true, cubic_feet: 300, booked: null },
        }),
      },
    );

    expect(previews.get("dup-id")?.state).toBe("found_by_fallback");
    expect(previews.get("dup-id")?.resolvedVantageId).toBe("canonical-id");
  });

  it("falls back to search when a valid id lookup returns not found", async () => {
    const row = makeRow({
      id: "id-then-fallback",
      refNo: "6a1743a401a95dbdc5bd8797",
      status: "syncable",
      quoted: true,
      phone: "5551234567",
      email: "a@b.com",
    });

    const previews = await previewFormLeadRows(
      [row],
      lookupTable({}, async () => ({
        status: "found",
        found: true,
        message: "found",
        matches: [{ _id: "resolved", quoted: true, cubic_feet: 300, booked: null }],
        lead: { _id: "resolved", quoted: true, cubic_feet: 300, booked: null },
      })),
    );

    expect(previews.get("id-then-fallback")?.matchMethod).toBe("phone_and_email");
  });
});
