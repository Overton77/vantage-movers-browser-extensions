import { describe, expect, it } from "vitest";

import followUpCsv from "./fixtures/granot-follow-up.csv?raw";
import csvLinksHtml from "./fixtures/granot-crm-with-csv-links.html?raw";
import {
  classifyCsvHref,
  discoverGranotCsvLinks,
} from "../parsers/granot/csv-links";
import {
  buildRowKey,
  isGranotDataRow,
  parseGranotCsv,
} from "../parsers/granot/csv";

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("Granot CSV link discovery", () => {
  it("classifies booked and follow CSV hrefs", () => {
    expect(classifyCsvHref("/vantage/bu/book_advr1628.csv")).toBe("booked");
    expect(classifyCsvHref("/vantage/bu/follow_advr7777.csv")).toBe(
      "follow_up",
    );
    expect(classifyCsvHref("/other/file.csv")).toBeUndefined();
  });

  it("discovers both CSV links from a Granot page fixture", () => {
    const links = discoverGranotCsvLinks(
      parseHtml(csvLinksHtml),
      "https://eagle.hellomoving.com/wc.dll?example",
    );

    expect(links).toHaveLength(2);
    expect(links.map((link) => link.csvKind)).toEqual(["follow_up", "booked"]);
    expect(links[1]?.href).toBe("/vantage/bu/book_advr1628.csv");
  });
});

describe("parseGranotCsv", () => {
  it("parses follow-up CSV rows and skips footer totals", () => {
    const parsed = parseGranotCsv(followUpCsv, "follow_up");

    expect(parsed.headers).toContain("job_no");
    expect(parsed.counts).toEqual({
      total: 3,
      dataRows: 2,
      skippedRows: 1,
    });
    expect(parsed.rows[0]?.job_no).toBe("P5557364");
    expect(parsed.rows[0]?.prior).toBe("1");
    expect(parsed.rows[1]?.customer).toBe("Todd Fiser");
    expect(parsed.rows[0]?.rowKey).toBe("job:P5557364");
  });

  it("identifies data rows vs blank/total rows", () => {
    expect(isGranotDataRow({ job_no: "P5557382" })).toBe(true);
    expect(
      isGranotDataRow({
        ref_no: "674a1b2c3d4e5f6789012345",
      }),
    ).toBe(true);
    expect(
      isGranotDataRow({
        customer: "Lisa Haney",
        phone: "(804) 304-7308",
      }),
    ).toBe(true);
    expect(isGranotDataRow({ miles: "1798", est_cf: "3360" })).toBe(false);
  });

  it("builds stable row keys", () => {
    expect(buildRowKey({ job_no: "P5557382" })).toBe("job:P5557382");
    expect(
      buildRowKey({
        phone: "(804) 304-7308",
        email: "lisahaney24@gmail.com",
      }),
    ).toBe("contact:8043047308|lisahaney24@gmail.com");
  });
});
