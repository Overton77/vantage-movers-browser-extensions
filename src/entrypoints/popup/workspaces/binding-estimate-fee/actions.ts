import type { BindingEstimateFeeApplyResult } from "../../../../parsers/granot/form-edit-lead";
import { sendActiveTabMessage } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderBindingEstimateFee } from "./render";

export async function fillBindingEstimateFee(app: AppContext): Promise<void> {
  const { dom } = app;
  const state = app.state.bindingEstimateFee;
  state.bindingEstimateFeeResult = undefined;
  renderBindingEstimateFee(app);
  setBusy(app, true);
  setStatus(
    dom,
    "Reading Initial Price and writing 85% into Binding Estimate Fee...",
  );

  try {
    const response = await sendActiveTabMessage<BindingEstimateFeeApplyResult>(
      { type: "APPLY_BINDING_ESTIMATE_FEE" },
      app.targetTabId,
    );
    state.bindingEstimateFeeResult = response;
    renderBindingEstimateFee(app);
    setStatus(dom, response.message, {
      tone: response.updated ? "info" : "error",
    });
  } catch (err) {
    state.bindingEstimateFeeResult = {
      ok: true,
      pageFound: false,
      updated: false,
      message: `Could not write Binding Estimate Fee: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
    renderBindingEstimateFee(app);
    setStatus(dom, state.bindingEstimateFeeResult.message, { tone: "error" });
  } finally {
    setBusy(app, false);
  }
}
