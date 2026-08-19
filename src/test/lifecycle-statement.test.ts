import { describe, expect, it } from "vitest";

import {
  buildCallLeadStatement,
  buildFormLeadStatement,
  formLeadOperationKind,
  statementHasQuoted,
} from "../lifecycle/statement";
import type { FollowUpRow } from "../workflows/form-leads/types";

function makeFormRow(overrides: Partial<FollowUpRow> = {}): FollowUpRow {
  return {
    id: "row-1",
    rowIndex: 1,
    tableSource: "followUpEstimates",
    refNo: "G-9",
    prior: "1",
    quoted: true,
    customer: "Pat",
    userRaw: "USER1",
    repRaw: "REP2",
    salesRepRaw: "USER1",
    status: "syncable",
    ...overrides,
  };
}

describe("statement fidelity [AC-34]", () => {
  it("keeps raw Priority and separate user/rep and never derives quoted", () => {
    const statement = buildFormLeadStatement(makeFormRow({ prior: "0", quoted: false }));
    expect(statement.priority).toBe("0");
    expect(statement.user).toBe("USER1");
    expect(statement.rep).toBe("REP2");
    expect(statementHasQuoted(statement)).toBe(false);
    expect(formLeadOperationKind(makeFormRow())).toBe("lead_snapshot_apply");
  });

  it("emits booking_action_apply Booked evidence without collapsing user/rep", () => {
    const row = makeFormRow({ tableSource: "bookedJobs" });
    expect(formLeadOperationKind(row)).toBe("booking_action_apply");
    expect(buildFormLeadStatement(row).event_type).toBe("Booked");
    expect(buildFormLeadStatement(row).user).toBe("USER1");
    expect(buildFormLeadStatement(row).rep).toBe("REP2");
  });

  it("reads call-lead user and rep from separate raw columns", () => {
    const statement = buildCallLeadStatement(
      {
        id: "c1",
        rowIndex: 1,
        values: {
          prior: "5",
          user: "CALLUSER",
          rep: "CALLREP",
          job_no: "P1",
        },
      },
      "lead_snapshot_apply",
    );
    expect(statement).toEqual({
      job_no: "P1",
      priority: "5",
      user: "CALLUSER",
      rep: "CALLREP",
    });
    expect(
      buildCallLeadStatement(
        { id: "c1", rowIndex: 1, values: { prior: "1" } },
        "booking_action_apply",
      ).event_type,
    ).toBe("Booked");
  });
});
