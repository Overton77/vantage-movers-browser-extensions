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

type RowSyncResult = {
  status: 'updated' | 'unchanged' | 'failed' | 'skipped';
  message: string;
};

const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const summaryEl = document.querySelector<HTMLDivElement>('#summary')!;
const rowsEl = document.querySelector<HTMLDivElement>('#rows')!;
const dumpBtn = document.querySelector<HTMLButtonElement>('#dump-tables')!;
const scanFollowUpBtn = document.querySelector<HTMLButtonElement>('#scan-follow-up')!;
const syncSelectedBtn = document.querySelector<HTMLButtonElement>('#sync-selected')!;
const syncAllBtn = document.querySelector<HTMLButtonElement>('#sync-all')!;
const selectAllBtn = document.querySelector<HTMLButtonElement>('#select-all')!;
const deselectAllBtn = document.querySelector<HTMLButtonElement>('#deselect-all')!;

let parsedRows: FollowUpRow[] = [];
let selectedRowIds = new Set<string>();
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

scanFollowUpBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Scanning Follow Up Estimates…';
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

async function syncRows(rows: FollowUpRow[]) {
  const syncableRows = rows.filter(isSyncableRow);
  if (syncableRows.length === 0) {
    statusEl.textContent = 'No supported rows selected for sync.';
    return;
  }

  setBusy(true);
  statusEl.textContent = `Syncing ${syncableRows.length} row(s)…`;

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const row of syncableRows) {
    if (typeof row.quoted !== 'boolean') {
      syncResults.set(row.id, {
        status: 'skipped',
        message: 'Missing quoted target',
      });
      continue;
    }

    try {
      const current = await getFormLeadById(row.refNo);
      if (current.quoted === row.quoted) {
        unchanged += 1;
        syncResults.set(row.id, {
          status: 'unchanged',
          message: `Already quoted=${row.quoted}`,
        });
      } else {
        await updateFormLeadQuoted(row.refNo, row.quoted);
        updated += 1;
        syncResults.set(row.id, {
          status: 'updated',
          message: `Updated quoted=${row.quoted}`,
        });
      }
    } catch (err) {
      failed += 1;
      syncResults.set(row.id, {
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    render();
  }

  statusEl.textContent = `Sync complete. Updated ${updated}, unchanged ${unchanged}, failed ${failed}.`;
  setBusy(false);
  render();
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
  renderRows();
  updateControls();
}

function renderSummary() {
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

function statusBadge(row: FollowUpRow): HTMLSpanElement {
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
