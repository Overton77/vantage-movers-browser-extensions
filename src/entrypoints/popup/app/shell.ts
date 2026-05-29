// Popup shell actions — the top-bar movable-window button and the connection
// chip that reports whether a Granot tab was resolved. Extracted from
// `popup/main.ts` in Unit 07.
import { getTargetTabId } from "../../../messaging/tabs";
import type { AppContext } from "./context";
import { setStatus } from "../ui/status";

export async function openDetached(app: AppContext): Promise<void> {
  const { dom } = app;
  if (app.isDetachedWindow) {
    setStatus(dom, "This popup is already in a movable browser window.");
    return;
  }

  try {
    const tabId = await getTargetTabId(app.targetTabId);
    const popupUrl = browser.runtime.getURL(
      `/popup.html?detached=1&targetTabId=${encodeURIComponent(String(tabId))}`,
    );
    await browser.windows.create({
      url: popupUrl,
      type: "popup",
      width: 1040,
      height: 820,
    });
    setStatus(dom, "Opened a movable Granot Sync window tied to this tab.");
  } catch {
    setStatus(
      dom,
      "Could not open a movable window. Make sure a Granot tab is active.",
      { tone: "error" },
    );
  }
}

export async function refreshConnectionChip(app: AppContext): Promise<void> {
  const { dom } = app;
  try {
    const tabId = await getTargetTabId(app.targetTabId);
    dom.connChip.classList.remove("is-bad");
    dom.connChip.classList.add("is-ok");
    dom.connChipText.textContent = `Connected · tab #${tabId}`;
  } catch {
    dom.connChip.classList.remove("is-ok");
    dom.connChip.classList.add("is-bad");
    dom.connChipText.textContent = "no Granot tab found";
  }
}
