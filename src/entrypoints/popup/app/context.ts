// Shared popup app context. A single object created in `main.ts` that bundles
// the one owner of mutable popup state, the DOM handle, and the popup-mode
// flags. Render, event, router, and action modules all receive this context so
// there is a single source of truth and no module-level mutable globals.
import type { AppState } from "../../../app/state";
import type { PopupDom } from "../ui/dom";

export type AppContext = {
  dom: PopupDom;
  state: AppState;
  /** True when running inside the detached movable window (`?detached=1`). */
  isDetachedWindow: boolean;
  /** Tab this popup is pinned to, when launched as a detached window. */
  targetTabId?: number;
};
