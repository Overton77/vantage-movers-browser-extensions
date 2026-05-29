// Workspace router. Switches the active workspace, toggles the sidebar tab and
// workspace `is-active` classes, resets the scroll position, and persists the
// choice. Extracted from `popup/main.ts` in Unit 07.
import type { WorkspaceId } from "../../../app/state";
import type { AppContext } from "./context";
import { savePersistedState } from "./persistence";

export function setActiveWorkspace(
  app: AppContext,
  workspace: WorkspaceId,
  options?: { persist?: boolean },
): void {
  const { dom, state } = app;
  state.activeWorkspace = workspace;
  for (const tab of dom.sidebarTabs) {
    tab.classList.toggle("is-active", tab.dataset.workspace === workspace);
  }
  for (const ws of dom.workspaces) {
    ws.classList.toggle("is-active", ws.dataset.workspace === workspace);
  }
  if (dom.main) {
    dom.main.scrollTop = 0;
  }
  if (options?.persist !== false) {
    void savePersistedState(state);
  }
}
