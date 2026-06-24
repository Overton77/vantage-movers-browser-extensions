import type { AppContext } from "../../app/context";

export function renderBindingEstimateFee(app: AppContext): void {
  const { dom, state } = app;
  const result = state.bindingEstimateFee.bindingEstimateFeeResult;
  dom.bef.fill.disabled = state.isBusy;
  dom.bef.openDetached.disabled =
    state.isBusy || app.isDetachedWindow || !state.auth.session;
  dom.bef.content.textContent = "";

  if (!result) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      "<strong>No fee written yet</strong>Open a Granot <em>Edit Form Lead</em> page on the active tab, then click <em>Fill Binding Estimate Fee</em>.";
    dom.bef.content.append(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "card";

  const title = document.createElement("h3");
  title.className = "card__title";
  title.textContent = "Binding Estimate Fee Result";
  card.append(title);

  const banner = document.createElement("div");
  banner.className = `banner ${result.updated ? "info" : "error"}`;
  banner.style.marginBottom = "12px";
  banner.textContent = result.message;
  card.append(banner);

  const details = document.createElement("div");
  details.className = "row-meta";
  details.textContent = [
    result.sourceField ? `source: ${result.sourceField}` : undefined,
    result.initialPrice ? `initial price: ${result.initialPrice}` : undefined,
    result.labelField ? `label: ${result.labelField}` : undefined,
    result.previousFeeLabel ? `previous label: ${result.previousFeeLabel}` : undefined,
    result.targetField ? `target: ${result.targetField}` : undefined,
    result.previousFeeAmount ? `previous fee: ${result.previousFeeAmount}` : undefined,
    result.feeAmount ? `new fee: ${result.feeAmount}` : undefined,
    result.frameCount ? `frames checked: ${result.frameCount}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
  if (details.textContent) {
    card.append(details);
  }

  dom.bef.content.append(card);
}
