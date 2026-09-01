import { describe, expect, it } from "vitest";

import betterFormHtml from "../../docs/better_form.html?raw";
import movingFormHtml from "../../docs/moving_form_for_tariff.html?raw";
import { parseTariffAdjustmentRows } from "../parsers/granot/tariff-adjustment";

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const NOW = new Date(2026, 8, 1);

describe("parseTariffAdjustmentRows", () => {
  it("extracts Linehaul and Additional Services rows from better_form.html", () => {
    const result = parseTariffAdjustmentRows(parseHtml(betterFormHtml), {
      now: NOW,
    });

    expect(result.pageFound).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.rows).toEqual([
      {
        effectiveDate: "9/1/2026",
        pickupZone: "22079",
        deliveryZone: "29671",
        service: "Linehaul",
        rule: "300 cf",
        newRule: "$3.75 per cf",
        carrier: "C2C",
      },
      {
        effectiveDate: "9/1/2026",
        pickupZone: "22079",
        deliveryZone: "29671",
        service: "Additional Services",
        rule: "Binding Estimate Fee",
        newRule: "$956.25",
        carrier: "C2C",
      },
    ]);
  });

  it("extracts the same fields from moving_form_for_tariff.html and reports the empty Agent", () => {
    const result = parseTariffAdjustmentRows(parseHtml(movingFormHtml), {
      now: NOW,
    });

    expect(result.pageFound).toBe(true);
    expect(result.located.pickupZone).toBe("92037");
    expect(result.located.deliveryZone).toBe("95695");
    expect(result.located.linehaulRule).toBe("300 cf");
    expect(result.located.linehaulNewRule).toBe("$3.75 per cf");
    expect(result.located.additionalServicesRule).toBe("Binding Estimate Fee");
    expect(result.located.additionalServicesNewRule).toBe("$956.25");
    expect(result.located.carrier).toBeUndefined();
    expect(result.missing).toEqual(["carrier"]);
    expect(result.rows).toEqual([
      {
        effectiveDate: "9/1/2026",
        pickupZone: "92037",
        deliveryZone: "95695",
        service: "Linehaul",
        rule: "300 cf",
        newRule: "$3.75 per cf",
        carrier: "",
      },
      {
        effectiveDate: "9/1/2026",
        pickupZone: "92037",
        deliveryZone: "95695",
        service: "Additional Services",
        rule: "Binding Estimate Fee",
        newRule: "$956.25",
        carrier: "",
      },
    ]);
  });

  it("does not keep customer or job identifiers on the rows", () => {
    const result = parseTariffAdjustmentRows(parseHtml(betterFormHtml), {
      now: NOW,
    });
    const serialized = JSON.stringify(result.rows);

    expect(serialized).not.toMatch(/Nicholas|Peterman|ncpetey|9314|18649189984/i);
    expect(serialized).not.toMatch(/ORDREF|jobNo|customer|email|phone/i);
    expect(new Set(result.rows.flatMap((row) => Object.keys(row)))).toEqual(
      new Set([
        "effectiveDate",
        "pickupZone",
        "deliveryZone",
        "service",
        "rule",
        "newRule",
        "carrier",
      ]),
    );
  });

  it("reports pageFound: false when the page is not a Forms View", () => {
    const result = parseTariffAdjustmentRows(
      parseHtml("<html><body><p>not a granot form</p></body></html>"),
    );

    expect(result.pageFound).toBe(false);
    expect(result.rows).toEqual([]);
  });
});
