import { getFormLeadById, updateFormLeadQuoted } from '../../utils/api';

type FollowUpRow = {
  id: string;
  rowIndex: number;
  displayNumber?: string;
  jobNo?: string;
  source?: string;
  refNo: string;
  prior: string;
  quoted?: boolean;
  customer?: string;
  phone?: string;
  email?: string;
  status: 'syncable' | 'invalid_ref_no' | 'unsupported_prior' | 'missing_prior';
  reason?: string;
};

type LeadStatus = FollowUpRow['status'];

type CurrentFormLead = {
  id: string;
  refNo: string;
  prior: string;
  priorityLevel: number | undefined;
  quoted?: boolean;
  status: LeadStatus;
  reason?: string;
  pageUrl: string;
};

type ParseResponse = {
  ok: true;
  tableFound: boolean;
  rows: FollowUpRow[];
  counts: {
    total: number;
    syncable: number;
    invalid: number;
    unsupported: number;
  };
};

type CurrentFormLeadParseResponse = {
  ok: true;
  pageFound: boolean;
  lead?: CurrentFormLead;
};

type LeadSyncCandidate = {
  id: string;
  refNo: string;
  quoted?: boolean;
  status: LeadStatus;
};

type CurrentLeadPreview = {
  lead: CurrentFormLead;
  currentQuoted?: boolean;
  error?: string;
};

type RowSyncResult = {
  status: 'updated' | 'unchanged' | 'failed' | 'skipped';
  message: string;
};

type ActiveMode = 'empty' | 'follow-up' | 'current-lead';
type OverrideMode = 'parsed' | 'quoted_false' | 'quoted_true';

const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const summaryEl = document.querySelector<HTMLDivElement>('#summary')!;
const rowsEl = document.querySelector<HTMLDivElement>('#rows')!;
const dumpBtn = document.querySelector<HTMLButtonElement>('#dump-tables')!;
const scanCurrentPageBtn = document.querySelector<HTMLButtonElement>('#scan-current-page')!;
const syncCurrentLeadBtn = document.querySelector<HTMLButtonElement>('#sync-current-lead')!;
const scanFollowUpBtn = document.querySelector<HTMLButtonElement>('#scan-follow-up')!;
const syncSelectedBtn = document.querySelector<HTMLButtonElement>('#sync-selected')!;
const syncAllBtn = document.querySelector<HTMLButtonElement>('#sync-all')!;
const selectAllBtn = document.querySelector<HTMLButtonElement>('#select-all')!;
const deselectAllBtn = document.querySelector<HTMLButtonElement>('#deselect-all')!;

let activeMode: ActiveMode = 'empty';
let parsedRows: FollowUpRow[] = [];
let selectedRowIds = new Set<string>();
let currentLeadPreview: CurrentLeadPreview | undefined;
let currentLeadOverride: OverrideMode = 'parsed';
let currentLeadResult: RowSyncResult | undefined;
let syncResults = new Map<string, RowSyncResult>();
let isBusy = false;

dumpBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Scanning…';

  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      statusEl.textContent = 'No active tab found.';
      return;
    }

    const response = await browser.tabs.sendMessage(tab.id, {
      type: 'DUMP_TABLES',
    });

    const count = response?.tables?.length ?? 0;
    statusEl.textContent = `Logged ${count} table(s) — see Console on the Granot tab.`;
  } catch {
    statusEl.textContent =
      'Could not reach content script. Reload the Granot page and try again.';
  }
});

scanCurrentPageBtn.addEventListener('click', async () => {
  await loadCurrentLeadPreview({ preserveOverride: false });
});

scanFollowUpBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Scanning Follow Up Estimates…';
  activeMode = 'follow-up';
  currentLeadPreview = undefined;
  currentLeadResult = undefined;
  syncResults = new Map();

  try {
    const response = await sendActiveTabMessage<ParseResponse>({
      type: 'PARSE_FOLLOW_UP_ROWS',
    });

    if (!response?.tableFound) {
      parsedRows = [];
      selectedRowIds = new Set();
      render();
      statusEl.textContent = 'No Follow Up Estimates table found on this tab.';
      return;
    }

    parsedRows = response.rows;
    selectedRowIds = new Set(response.rows.filter(isSyncableRow).map((row) => row.id));
    render();
    statusEl.textContent = `Found ${response.counts.total} row(s), ${response.counts.syncable} syncable.`;
  } catch {
    statusEl.textContent =
      'Could not scan. Reload the Granot page and confirm this tab is a matching CRM page.';
  }
});

selectAllBtn.addEventListener('click', () => {
  selectedRowIds = new Set(parsedRows.filter(isSyncableRow).map((row) => row.id));
  render();
});

deselectAllBtn.addEventListener('click', () => {
  selectedRowIds = new Set();
  render();
});

syncSelectedBtn.addEventListener('click', async () => {
  await syncRows(parsedRows.filter((row) => selectedRowIds.has(row.id)));
});

syncAllBtn.addEventListener('click', async () => {
  await syncRows(parsedRows.filter(isSyncableRow));
});

syncCurrentLeadBtn.addEventListener('click', async () => {
  await syncCurrentLead();
});

void loadCurrentLeadPreview({ preserveOverride: false, quiet: true });

async function loadCurrentLeadPreview(options: {
  preserveOverride: boolean;
  quiet?: boolean;
}): Promise<boolean> {
  if (!options.quiet) {
    statusEl.textContent = 'Scanning current Granot page…';
  }
  setBusy(true);

  try {
    const response = await sendActiveTabMessage<CurrentFormLeadParseResponse>({
      type: 'PARSE_CURRENT_FORM_LEAD',
    });

    activeMode = 'current-lead';
    parsedRows = [];
    selectedRowIds = new Set();
    syncResults = new Map();
    currentLeadResult = undefined;

    if (!options.preserveOverride) {
      currentLeadOverride = 'parsed';
    }

    if (!response?.pageFound || !response.lead) {
      activeMode = 'empty';
      currentLeadPreview = undefined;
      render();
      if (!options.quiet) {
        statusEl.textContent = 'No CRM form edit lead found on this tab.';
      }
      return false;
    }

    currentLeadPreview = { lead: response.lead };

    if (response.lead.status !== 'invalid_ref_no') {
      try {
        const current = await getFormLeadById(response.lead.refNo);
        currentLeadPreview = { lead: response.lead, currentQuoted: current.quoted };
      } catch (err) {
        currentLeadPreview = {
          lead: response.lead,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    render();
    if (!options.quiet) {
      statusEl.textContent = response.lead.reason ?? 'Current lead preview ready.';
    } else if (response.lead.status === 'syncable') {
      statusEl.textContent = 'Current lead detected. Review the preview before syncing.';
    }
    return true;
  } catch {
    activeMode = 'empty';
    currentLeadPreview = undefined;
    currentLeadResult = undefined;
    render();
    if (!options.quiet) {
      statusEl.textContent =
        'Could not scan current page. Reload the Granot page and try again.';
    }
    return false;
  } finally {
    setBusy(false);
  }
}

async function syncCurrentLead() {
  const refreshed = await loadCurrentLeadPreview({ preserveOverride: true, quiet: true });

  if (!refreshed) {
    statusEl.textContent = 'Could not re-scan the current lead. Reload the Granot page and try again.';
    return;
  }

  if (!currentLeadPreview) {
    statusEl.textContent = 'No current lead preview is available.';
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted();
  if (typeof targetQuoted !== 'boolean') {
    currentLeadResult = {
      status: 'skipped',
      message: 'Choose an override or use a parsed Level-0/Level-1 before syncing.',
    };
    render();
    statusEl.textContent = currentLeadResult.message;
    return;
  }

  setBusy(true);
  statusEl.textContent = 'Syncing current lead…';
  const candidate = {
    ...currentLeadPreview.lead,
    quoted: targetQuoted,
    status: 'syncable',
  } satisfies LeadSyncCandidate;

  const results = await syncLeadCandidates([candidate], (id, result) => {
    if (id === candidate.id) {
      currentLeadResult = result;
      render();
    }
  });

  statusEl.textContent = `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`;
  setBusy(false);
  render();
}

async function syncRows(rows: FollowUpRow[]) {
  const syncableRows = rows.filter(isSyncableRow).map(rowToSyncCandidate);
  if (syncableRows.length === 0) {
    statusEl.textContent = 'No supported rows selected for sync.';
    return;
  }

  setBusy(true);
  statusEl.textContent = `Syncing ${syncableRows.length} row(s)…`;

  const results = await syncLeadCandidates(syncableRows, (id, result) => {
    syncResults.set(id, result);
    render();
  });

  statusEl.textContent = `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`;
  setBusy(false);
  render();
}

async function syncLeadCandidates(
  candidates: LeadSyncCandidate[],
  onResult: (id: string, result: RowSyncResult) => void,
): Promise<{ updated: number; unchanged: number; failed: number }> {
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (typeof candidate.quoted !== 'boolean') {
      onResult(candidate.id, {
        status: 'skipped',
        message: 'Missing quoted target',
      });
      continue;
    }

    try {
      const current = await getFormLeadById(candidate.refNo);
      if (current.quoted === candidate.quoted) {
        unchanged += 1;
        onResult(candidate.id, {
          status: 'unchanged',
          message: `Already quoted=${candidate.quoted}`,
        });
      } else {
        await updateFormLeadQuoted(candidate.refNo, candidate.quoted);
        updated += 1;
        onResult(candidate.id, {
          status: 'updated',
          message: `Updated quoted=${candidate.quoted}`,
        });
      }
    } catch (err) {
      failed += 1;
      onResult(candidate.id, {
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { updated, unchanged, failed };
}

async function sendActiveTabMessage<T>(message: unknown): Promise<T> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error('No active tab found');
  }

  return browser.tabs.sendMessage(tab.id, message) as Promise<T>;
}

function render() {
  renderSummary();
  if (activeMode === 'current-lead') {
    renderCurrentLead();
  } else {
    renderRows();
  }
  updateControls();
}

function renderSummary() {
  if (activeMode === 'current-lead') {
    renderCurrentLeadSummary();
    return;
  }

  if (parsedRows.length === 0) {
    summaryEl.hidden = true;
    summaryEl.textContent = '';
    return;
  }

  const syncable = parsedRows.filter(isSyncableRow).length;
  const unsupported = parsedRows.filter((row) => row.status === 'unsupported_prior').length;
  const invalid = parsedRows.filter(
    (row) => row.status === 'invalid_ref_no' || row.status === 'missing_prior',
  ).length;
  const selected = parsedRows.filter((row) => selectedRowIds.has(row.id)).length;

  summaryEl.hidden = false;
  summaryEl.textContent = `${parsedRows.length} parsed row(s): ${syncable} syncable, ${unsupported} unsupported prior, ${invalid} invalid. ${selected} selected.`;
}

function renderCurrentLeadSummary() {
  if (!currentLeadPreview) {
    summaryEl.hidden = true;
    summaryEl.textContent = '';
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted();
  const currentQuoted = currentLeadPreview.currentQuoted;
  const action =
    typeof targetQuoted !== 'boolean'
      ? 'No sync target selected.'
      : typeof currentQuoted !== 'boolean'
        ? 'Preflight unavailable.'
        : currentQuoted === targetQuoted
          ? 'No update needed.'
          : `Will update quoted from ${currentQuoted} to ${targetQuoted}.`;

  summaryEl.hidden = false;
  summaryEl.textContent = action;
}

function renderCurrentLead() {
  rowsEl.textContent = '';

  if (!currentLeadPreview) {
    return;
  }

  const { lead } = currentLeadPreview;
  const targetQuoted = getCurrentLeadTargetQuoted();
  const rowEl = document.createElement('div');
  rowEl.className = `row ${canSyncCurrentLead() ? '' : 'unsyncable'}`;

  const headerEl = document.createElement('div');
  headerEl.className = 'row-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'row-title';
  titleEl.textContent = 'Current Lead';
  headerEl.append(titleEl, statusBadge(lead));

  if (currentLeadOverride !== 'parsed') {
    const overrideBadge = document.createElement('span');
    overrideBadge.className = 'badge warn';
    overrideBadge.textContent = 'override';
    headerEl.append(overrideBadge);
  }

  if (currentLeadResult) {
    headerEl.append(resultBadge(currentLeadResult));
  }

  rowEl.append(headerEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'row-meta';
  metaEl.textContent = [
    `ref_no: ${lead.refNo || 'missing'}`,
    `parsed priority: ${lead.prior ? `Level-${lead.prior}` : 'missing'}`,
    `current quoted: ${typeof currentLeadPreview.currentQuoted === 'boolean' ? currentLeadPreview.currentQuoted : 'unknown'}`,
    `target quoted: ${typeof targetQuoted === 'boolean' ? targetQuoted : 'n/a'}`,
    lead.reason,
    currentLeadPreview.error,
    currentLeadResult?.message,
  ]
    .filter(Boolean)
    .join(' | ');
  rowEl.append(metaEl);

  const overrideLabel = document.createElement('label');
  overrideLabel.className = 'override-control';
  overrideLabel.textContent = 'Sync target: ';

  const overrideSelect = document.createElement('select');
  overrideSelect.disabled = isBusy || lead.status === 'invalid_ref_no';
  overrideSelect.value = currentLeadOverride;
  appendOverrideOption(overrideSelect, 'parsed', 'Use parsed priority');
  appendOverrideOption(overrideSelect, 'quoted_false', 'Override to Not Quoted (Level-0)');
  appendOverrideOption(overrideSelect, 'quoted_true', 'Override to Quoted (Level-1)');
  overrideSelect.addEventListener('change', () => {
    currentLeadOverride = overrideSelect.value as OverrideMode;
    currentLeadResult = undefined;
    render();
  });

  overrideLabel.append(overrideSelect);
  rowEl.append(overrideLabel);
  rowsEl.append(rowEl);
}

function appendOverrideOption(select: HTMLSelectElement, value: OverrideMode, label: string) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function renderRows() {
  rowsEl.textContent = '';

  for (const row of parsedRows) {
    const rowEl = document.createElement('div');
    rowEl.className = `row ${isSyncableRow(row) ? '' : 'unsyncable'}`;

    const headerEl = document.createElement('div');
    headerEl.className = 'row-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = !isSyncableRow(row);
    checkbox.checked = selectedRowIds.has(row.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedRowIds.add(row.id);
      } else {
        selectedRowIds.delete(row.id);
      }
      render();
    });
    headerEl.append(checkbox);

    const titleEl = document.createElement('span');
    titleEl.className = 'row-title';
    titleEl.textContent = `#${row.displayNumber || row.rowIndex} ${row.customer || 'Unknown customer'}`;
    headerEl.append(titleEl);

    headerEl.append(statusBadge(row));
    const result = syncResults.get(row.id);
    if (result) {
      headerEl.append(resultBadge(result));
    }
    rowEl.append(headerEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'row-meta';
    metaEl.textContent = [
      `job_no: ${row.jobNo || 'n/a'}`,
      `source: ${row.source || 'n/a'}`,
      `ref_no: ${row.refNo || 'missing'}`,
      `prior: ${row.prior || 'missing'}`,
      `target quoted: ${typeof row.quoted === 'boolean' ? row.quoted : 'n/a'}`,
      row.email ? `email: ${row.email}` : undefined,
      row.phone ? `phone: ${row.phone}` : undefined,
      row.reason,
      result?.message,
    ]
      .filter(Boolean)
      .join(' | ');
    rowEl.append(metaEl);
    rowsEl.append(rowEl);
  }
}

function updateControls() {
  const hasRows = parsedRows.length > 0;
  const hasSyncableRows = parsedRows.some(isSyncableRow);
  const hasSelectedRows = parsedRows.some((row) => selectedRowIds.has(row.id));

  scanCurrentPageBtn.disabled = isBusy;
  syncCurrentLeadBtn.disabled = isBusy || !canSyncCurrentLead();
  scanFollowUpBtn.disabled = isBusy;
  dumpBtn.disabled = isBusy;
  syncSelectedBtn.disabled = isBusy || !hasSelectedRows;
  syncAllBtn.disabled = isBusy || !hasSyncableRows;
  selectAllBtn.disabled = isBusy || !hasSyncableRows;
  deselectAllBtn.disabled = isBusy || !hasRows;
}

function setBusy(nextIsBusy: boolean) {
  isBusy = nextIsBusy;
  updateControls();
}

function isSyncableRow(row: FollowUpRow): boolean {
  return row.status === 'syncable' && typeof row.quoted === 'boolean';
}

function rowToSyncCandidate(row: FollowUpRow): LeadSyncCandidate {
  return {
    id: row.id,
    refNo: row.refNo,
    quoted: row.quoted,
    status: row.status,
  };
}

function getCurrentLeadTargetQuoted(): boolean | undefined {
  if (!currentLeadPreview) {
    return undefined;
  }

  if (currentLeadOverride === 'quoted_false') {
    return false;
  }

  if (currentLeadOverride === 'quoted_true') {
    return true;
  }

  return currentLeadPreview.lead.quoted;
}

function canSyncCurrentLead(): boolean {
  if (!currentLeadPreview || currentLeadPreview.lead.status === 'invalid_ref_no') {
    return false;
  }

  return typeof getCurrentLeadTargetQuoted() === 'boolean';
}

function statusBadge(row: { status: LeadStatus }): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = row.status === 'syncable' ? 'badge ok' : 'badge warn';
  badge.textContent =
    row.status === 'syncable'
      ? 'syncable'
      : row.status === 'unsupported_prior'
        ? 'unsupported prior'
        : 'invalid';
  return badge;
}

function resultBadge(result: RowSyncResult): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className =
    result.status === 'updated'
      ? 'badge ok'
      : result.status === 'failed'
        ? 'badge error'
        : 'badge';
  badge.textContent = result.status;
  return badge;
}
