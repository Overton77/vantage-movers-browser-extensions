import { sendActiveTabMessage } from "../../../../messaging/tabs";
import {
  isTariffAdjustmentComplete,
} from "../../../../workflows/tariff-adjustment/preview";
import { submitTariffAdjustmentRows } from "../../../../workflows/tariff-adjustment/submit";
import type { TariffAdjustmentParseResult } from "../../../../parsers/granot/tariff-adjustment";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderTariffAdjustment } from "./render";

export async function parseTariffAdjustment(
  app: AppContext,
  options: { quiet?: boolean } = {},
): Promise<TariffAdjustmentParseResult | undefined> {
  const { dom } = app;
  const state = app.state.tariffAdjustment;
  state.submitResult = undefined;
  state.error = undefined;
  state.awaitingApproval = false;
  if (!options.quiet) {
    setStatus(dom, "Reading Tariff Adjustment fields from the Forms View…");
  }
  setBusy(app, true);

  try {
    const response = await sendActiveTabMessage<TariffAdjustmentParseResult>(
      { type: "PARSE_TARIFF_ADJUSTMENT" },
      app.targetTabId,
    );
    state.parseResult = response;
    state.printedRows = response.pageFound ? response.rows : undefined;
    renderTariffAdjustment(app);
    if (!options.quiet) {
      setStatus(dom, statusForParse(response), {
        tone: response.pageFound ? "info" : "error",
      });
    }
    return response;
  } catch (err) {
    state.parseResult = undefined;
    state.printedRows = undefined;
    state.error = err instanceof Error ? err.message : String(err);
    renderTariffAdjustment(app);
    if (!options.quiet) {
      setStatus(dom, `Could not read the Forms View: ${state.error}`, {
        tone: "error",
      });
    }
    return undefined;
  } finally {
    setBusy(app, false);
  }
}

export async function checkAndApproveTariffAdjustment(
  app: AppContext,
): Promise<void> {
  const parsed = await parseTariffAdjustment(app);
  if (!parsed) {
    return;
  }
  app.state.tariffAdjustment.awaitingApproval = isTariffAdjustmentComplete(parsed);
  renderTariffAdjustment(app);
  setStatus(
    app.dom,
    parsed.pageFound
      ? isTariffAdjustmentComplete(parsed)
        ? "Review the printed rows, then click Approve to write them."
        : "Printed the parse. Fill the missing fields before Approve."
      : "Open a Granot Forms View before submitting.",
    { tone: parsed.pageFound && isTariffAdjustmentComplete(parsed) ? "info" : "error" },
  );
}

export async function writeNowTariffAdjustment(app: AppContext): Promise<void> {
  const parsed = await parseTariffAdjustment(app);
  if (!parsed || !isTariffAdjustmentComplete(parsed) || !parsed.rows.length) {
    return;
  }
  await postPrintedRows(app);
}

export async function approveTariffAdjustment(app: AppContext): Promise<void> {
  const state = app.state.tariffAdjustment;
  if (!state.printedRows || !isTariffAdjustmentComplete(state.parseResult)) {
    setStatus(app.dom, "Approve is waiting on a complete printed parse.", {
      tone: "error",
    });
    return;
  }
  await postPrintedRows(app);
}

async function postPrintedRows(app: AppContext): Promise<void> {
  const { dom } = app;
  const state = app.state.tariffAdjustment;
  const rows = state.printedRows;
  if (!rows) {
    return;
  }

  setBusy(app, true);
  setStatus(dom, "Writing the printed Tariff Adjustment rows…");
  try {
    const result = await submitTariffAdjustmentRows(rows);
    state.submitResult = result;
    state.awaitingApproval = false;
    state.error = undefined;
    renderTariffAdjustment(app);
    setStatus(
      dom,
      `Wrote ${result.appended} rows on ${result.tab_name}${
        result.updated_range ? ` (${result.updated_range})` : ""
      }.`,
    );
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    renderTariffAdjustment(app);
    setStatus(dom, `Tariff Adjustment Submit failed: ${state.error}`, {
      tone: "error",
    });
  } finally {
    setBusy(app, false);
  }
}

function statusForParse(result: TariffAdjustmentParseResult): string {
  if (!result.pageFound) {
    return "This tab is not a Granot Forms View. Nothing was written.";
  }
  if (result.missing.length > 0) {
    return `Parsed both rows. Missing: ${result.missing.join(", ")}.`;
  }
  return "Parsed both Tariff Adjustment rows.";
}
