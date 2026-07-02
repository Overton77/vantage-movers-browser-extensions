// Application state shape for the popup. Type definitions only — state is still
// initialized and mutated inside popup/main.ts until render/event modules are
// split (Unit 07). Extracted in Unit 02 so workflow modules can reference the
// shared state vocabulary.
import type { CycleEntry } from "../auto-sync/cycles";
import type { AutomatedSyncSettings } from "../auto-sync/settings";
import type { BackgroundCycle } from "../auto-sync/storage";
import type {
  BookedCallLeadReconciliationPreview,
  CallLeadEnrichmentPreview,
  CallLeadPreviewResponse,
} from "../workflows/call-leads/types";
import type {
  CurrentLeadPreview,
  FollowUpRow,
  FormLeadRowPreview,
  RowSyncResult,
} from "../workflows/form-leads/types";
import type { CallLeadCard, FormLeadCard } from "../api/leadBrowse";
import type { Agent } from "../api/agents";
import type { CsvFileSnapshot, GranotCsvLink } from "../workflows/csv-sync/types";
import type { BindingEstimateFeeApplyResult } from "../parsers/granot/form-edit-lead";
import type { AuthSession } from "../auth/types";

export type WorkspaceId =
  | "form-leads"
  | "form-edit-lead"
  | "binding-estimate-fee"
  | "call-leads"
  | "search"
  | "csv"
  | "automation"
  | "diagnose"
  | "debug";

export type ListWorkspaceId = "form-leads" | "call-leads";

export type IntervalUnit = "seconds" | "minutes" | "hours";

export type ProgressFilter = "all" | "syncable" | "failed";

export type OverrideMode = "parsed" | "quoted_false" | "quoted_true";

export type FormLeadsState = {
  parsedRows: FollowUpRow[];
  selectedRowIds: Set<string>;
  /**
   * Map of FollowUpRow.id → preview of the Vantage form lead, populated
   * after each scan so we can show "has booking", "idempotent" or "will update"
   * badges before the user clicks Sync.
   */
  previews: Map<string, FormLeadRowPreview>;
  /** Row ids whose accordions are expanded (collapsed by default). */
  openRowIds: Set<string>;
  syncResults: Map<string, RowSyncResult>;
  cycles: CycleEntry[];
  progressFilter: ProgressFilter;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  hasScanned: boolean;
  logTablesOpen: boolean;
  followUpOpen: boolean;
};

export type CallLeadsState = {
  preview?: CallLeadPreviewResponse;
  enrichmentRows: CallLeadEnrichmentPreview[];
  bookedReconciliationRows: BookedCallLeadReconciliationPreview[];
  selectedRowIds: Set<string>;
  /** Row ids whose accordions are expanded (collapsed by default). */
  openRowIds: Set<string>;
  cycles: CycleEntry[];
  progressFilter: ProgressFilter;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  autoRunning: boolean;
  autoTimerId?: number;
  autoStartedAt?: string;
  hasScanned: boolean;
  logTablesOpen: boolean;
  followUpOpen: boolean;
  bookedOpen: boolean;
};

export type FormEditLeadState = {
  preview?: CurrentLeadPreview;
  override: OverrideMode;
  result?: RowSyncResult;
};

export type BindingEstimateFeeState = {
  bindingEstimateFeeResult?: BindingEstimateFeeApplyResult;
};

/** Which lead type the Search workspace is querying. */
export type SearchEntity = "form-leads" | "call-leads";

export type SearchQuery = {
  q: string;
  source_company: string;
  name: string;
  email: string;
  phone_number: string;
};

/**
 * Search workspace state. Kept independent from the form/call sync slices: it
 * only browses Vantage records read-only and never participates in scan or sync.
 */
export type SearchState = {
  entity: SearchEntity;
  query: SearchQuery;
  loading: boolean;
  error?: string;
  formResults: FormLeadCard[];
  callResults: CallLeadCard[];
  count: number;
  hasSearched: boolean;
};

export type CsvState = {
  discoveredLinks: GranotCsvLink[];
  files: CsvFileSnapshot[];
  crmOrigin?: string;
  hasDiscovered: boolean;
  openFileIds: Set<string>;
  error?: string;
};

/**
 * Popup-side mirror of the background auto-sync settings + recent cycles read
 * from `browser.storage.local`. The popup is the control surface; the actual
 * automation runs in the background service worker (Unit 08).
 */
export type AutomationState = {
  settings?: AutomatedSyncSettings;
  cycles: BackgroundCycle[];
  loaded: boolean;
};

export type AuthState = {
  loading: boolean;
  session?: AuthSession;
  error?: string;
};

/** Editable fields for the Sales Rep create/edit dialog, keyed by row key. */
export type SalesRepDialogState = {
  name: string;
  role: string;
  active: boolean;
  /** Inline search query over the full agent list (typo/nickname fallback). */
  searchQuery: string;
  error?: string;
};

/**
 * Agent catalog cache + ephemeral per-row Sales Rep attribution UI state for
 * the call-leads/form-leads workspaces. Deliberately kept out of `formLeads`/
 * `callLeads` state (and out of `PersistedState`) since none of this survives
 * a popup reload — see the "do not persist scan results" rule in
 * `persistence.ts`, which this mirrors for the Sales Rep flow.
 */
export type AgentsState = {
  items: Agent[];
  loading: boolean;
  loaded: boolean;
  error?: string;
  /** Row key -> open create/edit dialog state. Presence means the dialog is open. */
  dialogs: Map<string, SalesRepDialogState>;
  /** Row keys currently mid-flight on a link/create API call. */
  busyRowKeys: Set<string>;
  /** Row keys where the owner clicked "Change" on an already-linked row. */
  changeRequested: Set<string>;
  /** Row keys where the owner dismissed the dialog without linking. */
  closedRowKeys: Set<string>;
  /** Row key -> agent name, applied optimistically right after a successful link. */
  linkedOverrides: Map<string, string>;
};

export type AppState = {
  activeWorkspace: WorkspaceId;
  isBusy: boolean;
  auth: AuthState;
  formLeads: FormLeadsState;
  callLeads: CallLeadsState;
  formEditLead: FormEditLeadState;
  bindingEstimateFee: BindingEstimateFeeState;
  search: SearchState;
  csv: CsvState;
  automation: AutomationState;
  agents: AgentsState;
};

export type PersistedState = {
  activeWorkspace?: WorkspaceId;
  formLeads?: {
    intervalValue?: number;
    intervalUnit?: IntervalUnit;
    progressFilter?: ProgressFilter;
  };
  callLeads?: {
    intervalValue?: number;
    intervalUnit?: IntervalUnit;
    progressFilter?: ProgressFilter;
  };
  search?: {
    entity?: SearchEntity;
    query?: Partial<SearchQuery>;
  };
};
