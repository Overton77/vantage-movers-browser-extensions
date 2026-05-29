// Form Leads scan workflow. Sends the `PARSE_FOLLOW_UP_ROWS` request to the
// content script (via an injected sender) and returns plain data: the parsed
// response plus the row ids that should be selected by default. The popup keeps
// ownership of status, busy state, rendering, and the follow-up preview pass.
import { isSyncableRow } from "./payloads";
import type { ParseResponse } from "./types";

export type FormLeadsScanContext = {
  /** Sends `PARSE_FOLLOW_UP_ROWS` to the active Granot tab and returns the parse result. */
  sendParseMessage: () => Promise<ParseResponse>;
};

export type FormLeadsScanResult = {
  response: ParseResponse;
  /** Ids of rows that are syncable and selected by default. */
  syncableRowIds: string[];
};

export async function scanFollowUpRows(
  context: FormLeadsScanContext,
): Promise<FormLeadsScanResult> {
  const response = await context.sendParseMessage();
  const syncableRowIds = response.rows
    .filter(isSyncableRow)
    .map((row) => row.id);
  return { response, syncableRowIds };
}
