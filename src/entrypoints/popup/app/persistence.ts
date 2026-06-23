// Popup preference persistence. Loads/saves only stable preferences (active
// workspace + per-workflow interval/filter) to `browser.storage.local`, never
// transient DOM/scan state. Extracted from `popup/main.ts` in Unit 07. The type
// guards are exported because event wiring also validates `<select>` values.
import type {
  AppState,
  IntervalUnit,
  PersistedState,
  ProgressFilter,
  SearchEntity,
  WorkspaceId,
} from "../../../app/state";

const STORAGE_KEY = "granot-sync:popup-state-v1";

export async function loadPersistedState(state: AppState): Promise<void> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const raw = stored?.[STORAGE_KEY] as PersistedState | undefined;
    if (!raw) {
      return;
    }
    if (isWorkspaceId(raw.activeWorkspace)) {
      state.activeWorkspace = raw.activeWorkspace;
    }
    if (raw.formLeads) {
      const fl = raw.formLeads;
      if (typeof fl.intervalValue === "number" && fl.intervalValue > 0) {
        state.formLeads.intervalValue = fl.intervalValue;
      }
      if (isIntervalUnit(fl.intervalUnit)) {
        state.formLeads.intervalUnit = fl.intervalUnit;
      }
      if (isProgressFilter(fl.progressFilter)) {
        state.formLeads.progressFilter = fl.progressFilter;
      }
    }
    if (raw.callLeads) {
      const cl = raw.callLeads;
      if (typeof cl.intervalValue === "number" && cl.intervalValue > 0) {
        state.callLeads.intervalValue = cl.intervalValue;
      }
      if (isIntervalUnit(cl.intervalUnit)) {
        state.callLeads.intervalUnit = cl.intervalUnit;
      }
      if (isProgressFilter(cl.progressFilter)) {
        state.callLeads.progressFilter = cl.progressFilter;
      }
    }
    if (raw.search) {
      const sr = raw.search;
      if (isSearchEntity(sr.entity)) {
        state.search.entity = sr.entity;
      }
      if (sr.query && typeof sr.query === "object") {
        for (const key of [
          "q",
          "source_company",
          "name",
          "email",
          "phone_number",
        ] as const) {
          const value = sr.query[key];
          if (typeof value === "string") {
            state.search.query[key] = value;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Granot Sync] Failed to load persisted state:", err);
  }
}

export async function savePersistedState(state: AppState): Promise<void> {
  const payload: PersistedState = {
    activeWorkspace: state.activeWorkspace,
    formLeads: {
      intervalValue: state.formLeads.intervalValue,
      intervalUnit: state.formLeads.intervalUnit,
      progressFilter: state.formLeads.progressFilter,
    },
    callLeads: {
      intervalValue: state.callLeads.intervalValue,
      intervalUnit: state.callLeads.intervalUnit,
      progressFilter: state.callLeads.progressFilter,
    },
    search: {
      entity: state.search.entity,
      query: { ...state.search.query },
    },
  };
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: payload });
  } catch (err) {
    console.warn("[Granot Sync] Failed to save persisted state:", err);
  }
}

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return (
    value === "form-leads" ||
    value === "form-edit-lead" ||
    value === "binding-estimate-fee" ||
    value === "call-leads" ||
    value === "search" ||
    value === "csv" ||
    value === "automation" ||
    value === "diagnose" ||
    value === "debug"
  );
}

export function isSearchEntity(value: unknown): value is SearchEntity {
  return value === "form-leads" || value === "call-leads";
}

export function isIntervalUnit(value: unknown): value is IntervalUnit {
  return value === "seconds" || value === "minutes" || value === "hours";
}

export function isProgressFilter(value: unknown): value is ProgressFilter {
  return value === "all" || value === "syncable" || value === "failed";
}
