// Popup state factory. Owns the initial shape of the popup's mutable state. The
// state *types* live in the shared `src/app/state.ts` so workflow modules can
// reference them; this module produces the runtime instance the popup mutates.
// Extracted from `popup/main.ts` in Unit 07.
import type { AppState } from "../../../app/state";

export function createInitialState(): AppState {
  return {
    activeWorkspace: "form-leads",
    isBusy: false,
    formLeads: {
      parsedRows: [],
      selectedRowIds: new Set(),
      previews: new Map(),
      openRowIds: new Set(),
      syncResults: new Map(),
      cycles: [],
      progressFilter: "all",
      intervalValue: 30,
      intervalUnit: "seconds",
      autoRunning: false,
      hasScanned: false,
      logTablesOpen: false,
      followUpOpen: true,
    },
    callLeads: {
      enrichmentRows: [],
      bookedReconciliationRows: [],
      selectedRowIds: new Set(),
      openRowIds: new Set(),
      cycles: [],
      progressFilter: "all",
      intervalValue: 1,
      intervalUnit: "minutes",
      autoRunning: false,
      hasScanned: false,
      logTablesOpen: false,
      followUpOpen: true,
      bookedOpen: true,
    },
    formEditLead: {
      override: "parsed",
    },
    automation: {
      cycles: [],
      loaded: false,
    },
  };
}
