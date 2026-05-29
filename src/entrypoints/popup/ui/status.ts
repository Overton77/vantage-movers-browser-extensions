// Status-bar helper. Writes the popup's single status line and toggles its
// error tone. Extracted from `popup/main.ts` in Unit 07. Busy/spinner control
// lives in `app/render.ts` because it also re-renders the row lists.
import type { PopupDom } from "./dom";

export function setStatus(
  dom: PopupDom,
  message: string,
  options?: { tone?: "info" | "error" },
): void {
  dom.status.textContent = message;
  dom.status.classList.toggle("is-error", options?.tone === "error");
}
