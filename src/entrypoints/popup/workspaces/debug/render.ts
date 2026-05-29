// Debug workspace. Dumps every raw <table> on the target Granot tab to the
// browser console and reports frame coverage in the popup. Extracted from
// `popup/main.ts` in Unit 07.
import { sendActiveTabMessage } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";

export async function runDebugDumpTables(app: AppContext): Promise<void> {
  const { dom } = app;
  setStatus(dom, "Dumping raw tables to console…");
  dom.debugResult.textContent = "";
  setBusy(app, true);
  try {
    const response = await sendActiveTabMessage<{
      tables?: unknown[];
      frameResponses?: number;
      frameCount?: number;
    }>({ type: "DUMP_TABLES" }, app.targetTabId);

    const count = response?.tables?.length ?? 0;
    const frameResponses = response?.frameResponses ?? 0;
    const frameCount = response?.frameCount ?? 0;

    if (frameResponses === 0) {
      const message =
        "Content script did not respond in any frame. Reload the Granot tab — and if you loaded the dev build (chrome-mv3-dev / firefox-mv2-dev), make sure `pnpm dev` is still running.";
      dom.debugResult.textContent = message;
      setStatus(dom, message, { tone: "error" });
      return;
    }

    const message = `Logged ${count} table(s) across ${frameResponses}/${frameCount} frame(s) — see Console on the Granot tab (filter for "[Granot Sync]").`;
    dom.debugResult.textContent = message;
    setStatus(dom, message);
  } catch {
    const message =
      "Could not reach content script. Reload the Granot page and try again.";
    dom.debugResult.textContent = message;
    setStatus(dom, message, { tone: "error" });
  } finally {
    setBusy(app, false);
  }
}
