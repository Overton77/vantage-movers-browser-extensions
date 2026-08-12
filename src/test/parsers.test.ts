import { describe, expect, it } from "vitest";

import bookedJobsHtml from "./fixtures/form-leads-booked-jobs.html?raw";
import callLeadsPageHtml from "./fixtures/call-leads-page.html?raw";
import formEditLeadHtml from "./fixtures/form-edit-lead.html?raw";
import followUpEstimatesHtml from "./fixtures/form-leads-follow-up-estimates.html?raw";
import { getSalesRepRaw, parseCallLeadTables } from "../parsers/granot/call-leads";
import {
  applyBindingEstimateFeeFromInitialPrice,
  parseCurrentFormLead,
} from "../parsers/granot/form-edit-lead";
import { parseFormLeadRows } from "../parsers/granot/form-leads";

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// Fixture-sanity checks: these confirm the captured Granot HTML fixtures exist
// and contain the structural markers the parsers depend on.
describe("Granot HTML fixtures", () => {
  it("Booked Jobs fixture has a Booked Jobs heading and ref_no column", () => {
    expect(bookedJobsHtml).toContain("Booked Jobs");
    expect(bookedJobsHtml).toContain("ref_no");
    // A valid 24-char Mongo ObjectId row exists for the syncable case.
    expect(bookedJobsHtml).toContain("6a1743a401a95dbdc5bd8797");
  });

  it("Follow Up Estimates fixture has the heading and prior column", () => {
    expect(followUpEstimatesHtml).toContain("Follow Up Estimates");
    expect(followUpEstimatesHtml).toContain("prior");
  });

  it("Form Edit Lead fixture exposes the ORDREF input and priority level", () => {
    expect(formEditLeadHtml).toContain('name="ORDREF"');
    expect(formEditLeadHtml).toContain("fustatuswc");
    expect(formEditLeadHtml).toContain("Level - 1");
  });

  it("Call Leads page fixture contains both sections", () => {
    expect(callLeadsPageHtml).toContain("Booked Jobs");
    expect(callLeadsPageHtml).toContain("Follow Up Estimates");
  });
});

describe("parseFormLeadRows (Booked Jobs / Follow Up Estimates)", () => {
  it("treats provider and Mongo refs as identity candidates", () => {
    const result = parseFormLeadRows(parseHtml(bookedJobsHtml));

    expect(result.tableFound).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.counts).toEqual({
      total: 2,
      syncable: 2,
      invalid: 0,
      unsupported: 0,
    });

    const [providerRefRow, syncableRow] = result.rows;
    expect(providerRefRow.tableSource).toBe("bookedJobs");
    expect(providerRefRow.refNo).toBe("Mob_t3ePdBDVFn");
    expect(providerRefRow.status).toBe("syncable");

    expect(syncableRow.refNo).toBe("6a1743a401a95dbdc5bd8797");
    expect(syncableRow.prior).toBe("5");
    expect(syncableRow.status).toBe("syncable");
    expect(syncableRow.quoted).toBe(true);
    expect(syncableRow.cubicFeet).toBe(491);
    expect(syncableRow.jobNo).toBe("P5556767");
    expect(syncableRow.from).toBe("Chicago,IL");
    expect(syncableRow.fromZip).toBe("60647");
    expect(syncableRow.to).toBe("Cincinnati,OH");
    expect(syncableRow.toZip).toBe("45227");
    expect(providerRefRow.salesRepRaw).toBe("JACOB");
    expect(syncableRow.salesRepRaw).toBe("MIKEM");
  });

  it("validates prior independently from ref_no shape", () => {
    const result = parseFormLeadRows(parseHtml(followUpEstimatesHtml));

    expect(result.tableFound).toBe(true);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.status)).toEqual([
      "syncable",
      "unsupported_prior",
      "unsupported_prior",
    ]);
    // "Pool" is a non-numeric prior that is preserved as-is.
    expect(result.rows[1].prior).toBe("Pool");
    expect(result.rows[0].salesRepRaw).toBe("SEAN");
    expect(result.rows[2].salesRepRaw).toBe("ROY");
    expect(result.counts).toEqual({
      total: 3,
      syncable: 1,
      invalid: 0,
      unsupported: 2,
    });
  });

  it("returns tableFound: false when no Form Lead table is present", () => {
    const result = parseFormLeadRows(
      parseHtml("<html><body><p>nothing here</p></body></html>"),
    );

    expect(result.tableFound).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.counts).toEqual({
      total: 0,
      syncable: 0,
      invalid: 0,
      unsupported: 0,
    });
  });
});

describe("parseCurrentFormLead (Form Edit Lead page)", () => {
  it("parses a syncable current form lead from a valid ORDREF + priority", () => {
    const result = parseCurrentFormLead(
      parseHtml(formEditLeadHtml),
      "https://eagle.hellomoving.com/wc.dll?mpcharge~chargeswc",
    );

    expect(result.pageFound).toBe(true);
    expect(result.lead?.refNo).toBe("6a1743a401a95dbdc5bd8797");
    expect(result.lead?.priorityLevel).toBe(1);
    expect(result.lead?.prior).toBe("1");
    expect(result.lead?.status).toBe("syncable");
    expect(result.lead?.quoted).toBe(true);
  });

  it("flags an edit page with an invalid ORDREF as invalid_ref_no", () => {
    const html =
      '<html><body><form name="theForm">' +
      '<input name="ORDREF" value="not-a-mongo-id" />' +
      "</form></body></html>";
    const result = parseCurrentFormLead(
      parseHtml(html),
      "https://eagle.hellomoving.com/wc.dll?mpcharge~chargeswc",
    );

    expect(result.pageFound).toBe(true);
    expect(result.lead?.status).toBe("invalid_ref_no");
  });

  it("reports pageFound: false when the page is not an edit page", () => {
    const result = parseCurrentFormLead(
      parseHtml("<html><body><p>not an edit page</p></body></html>"),
      "https://eagle.hellomoving.com/wc.dll?somethingelse",
    );

    expect(result.pageFound).toBe(false);
    expect(result.lead).toBeUndefined();
  });
});

describe("applyBindingEstimateFeeFromInitialPrice (Forms View)", () => {
  it('writes "Binding Estimate Fee" and 85% of Initial Price into the first Extra row', () => {
    const document = parseHtml(formEditLeadHtml);
    const result = applyBindingEstimateFeeFromInitialPrice(document);

    expect(result.updated).toBe(true);
    expect(result.initialPrice).toBe("4800.00");
    expect(result.previousFeeLabel).toBe("");
    expect(result.previousFeeAmount).toBe("0.00");
    expect(result.feeAmount).toBe("4080.00");
    expect(
      document.querySelector<HTMLInputElement>('input[name="EXTRA1"]')?.value,
    ).toBe("Binding Estimate Fee");
    expect(
      document.querySelector<HTMLInputElement>('input[name="EXTRA1AMT"]')?.value,
    ).toBe("4080.00");
  });

  it("overwrites the first Extra row label and amount", () => {
    const document = parseHtml(
      '<form name="theForm"><input name="I1TOTAL" value="4800.00" />' +
        '<input name="EXTRA1" value="Packing Fee" />' +
        '<input name="EXTRA1AMT" value="25.00" /></form>',
    );
    const result = applyBindingEstimateFeeFromInitialPrice(document);

    expect(result.updated).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>('input[name="EXTRA1"]')?.value,
    ).toBe("Binding Estimate Fee");
    expect(
      document.querySelector<HTMLInputElement>('input[name="EXTRA1AMT"]')?.value,
    ).toBe("4080.00");
  });
});

describe("parseCallLeadTables (Call Leads preview)", () => {
  it("parses booked + follow-up sections into header-keyed rows", () => {
    const result = parseCallLeadTables(parseHtml(callLeadsPageHtml));

    expect(result.pageFound).toBe(true);

    const booked = result.sections.find(
      (section) => section.key === "bookedJobs",
    );
    const followUp = result.sections.find(
      (section) => section.key === "followUpEstimates",
    );

    expect(booked?.tableFound).toBe(true);
    expect(booked?.headers).toContain("job_no");
    expect(booked?.headers).toContain("customer");
    expect(booked?.rows).toHaveLength(1);
    expect(booked?.rows[0].values.customer).toBe("Helen Fazio");

    expect(followUp?.tableFound).toBe(true);
    expect(followUp?.rows).toHaveLength(1);
    expect(followUp?.rows[0].values.customer).toBe("Luis Cruz");
  });

  it("resolves salesRepRaw from `user`, falling back to `rep` when `user` is blank", () => {
    const result = parseCallLeadTables(parseHtml(callLeadsPageHtml));

    const booked = result.sections.find(
      (section) => section.key === "bookedJobs",
    );
    const followUp = result.sections.find(
      (section) => section.key === "followUpEstimates",
    );

    expect(getSalesRepRaw(booked!.rows[0])).toBe("JACOB");
    expect(followUp?.rows[0].values.user).toBeFalsy();
    expect(getSalesRepRaw(followUp!.rows[0])).toBe("MIKEM");
  });

  it("reports pageFound: false when no call lead tables are present", () => {
    const result = parseCallLeadTables(
      parseHtml("<html><body><p>nothing here</p></body></html>"),
    );

    expect(result.pageFound).toBe(false);
    expect(result.sections.every((section) => !section.tableFound)).toBe(true);
  });
});
