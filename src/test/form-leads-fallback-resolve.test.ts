import { describe, expect, it } from "vitest";

import type { FormLeadSearchMatch } from "../utils/api";
import {
  flattenSearchMatches,
  pickResolvableFallbackMatch,
} from "../workflows/form-leads/fallback-resolve";
import type { FollowUpRow } from "../workflows/form-leads/types";

function makeRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    refNo: "Mob_9qWT0DMsNt",
    prior: "1",
    status: "invalid_ref_no",
    phone: "+16086211565",
    email: "kierresales@gmail.com",
    source: "Top10 Forms",
    ...overrides,
  };
}

function makeMatch(
  overrides: Partial<FormLeadSearchMatch> = {},
): FormLeadSearchMatch {
  return {
    _id: "6a3159c8c439303a5bc16b27",
    ref_no: "Mob_9qWT0DMsNt",
    source_company: "top10_leads",
    quoted: false,
    ...overrides,
  };
}

describe("flattenSearchMatches", () => {
  it("flattens nested server matches", () => {
    const [flat] = flattenSearchMatches([
      {
        lead: {
          _id: "abc123",
          ref_no: "Mob_x",
          source_company: "top10_leads",
          quoted: true,
        },
        score: 75,
        matched_fields: ["email", "phone_number"],
      },
    ]);

    expect(flat).toMatchObject({
      _id: "abc123",
      ref_no: "Mob_x",
      source_company: "top10_leads",
      quoted: true,
      score: 75,
      matched_fields: ["email", "phone_number"],
    });
  });
});

describe("pickResolvableFallbackMatch", () => {
  it("prefers a unique ref_no match", () => {
    const resolution = pickResolvableFallbackMatch(makeRow(), [
      makeMatch(),
      makeMatch({
        _id: "6a315643c439303a5bc16b0e",
        ref_no: "stf6cce70740684257be5e0f1094846243",
        source_company: "tbm_leads",
      }),
    ]);

    expect(resolution?.match._id).toBe("6a3159c8c439303a5bc16b27");
    expect(resolution?.reason).toContain("ref_no");
  });

  it("prefers a unique Granot source label match", () => {
    const resolution = pickResolvableFallbackMatch(
      makeRow({ refNo: "different-ref" }),
      [
        makeMatch({ ref_no: "Mob_a" }),
        makeMatch({
          _id: "6a315643c439303a5bc16b0e",
          ref_no: "Mob_b",
          source_company: "tbm_leads",
        }),
      ],
    );

    expect(resolution?.match.source_company).toBe("top10_leads");
    expect(resolution?.reason).toContain("Top10 Forms");
  });

  it("prefers a unique quoted alignment with Granot prior", () => {
    const resolution = pickResolvableFallbackMatch(
      makeRow({ refNo: "different-ref", source: "Unknown Source", prior: "1" }),
      [
        makeMatch({ quoted: true }),
        makeMatch({
          _id: "6a315643c439303a5bc16b0e",
          quoted: false,
          source_company: "tbm_leads",
        }),
      ],
    );

    expect(resolution?.match.quoted).toBe(true);
    expect(resolution?.reason).toContain("quoted=true");
  });

  it("returns undefined when tie-break criteria do not isolate one lead", () => {
    const resolution = pickResolvableFallbackMatch(
      makeRow({ refNo: "different-ref", source: "Unknown Source", prior: "1" }),
      [
        makeMatch({ quoted: false }),
        makeMatch({
          _id: "6a315643c439303a5bc16b0e",
          quoted: false,
          source_company: "tbm_leads",
        }),
      ],
    );

    expect(resolution).toBeUndefined();
  });
});
