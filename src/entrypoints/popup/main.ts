const statusEl = document.querySelector('#status')!;
const dumpBtn = document.querySelector('#dump-tables')!;
const syncFollowUpBtn = document.querySelector('#sync-follow-up')!;

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

syncFollowUpBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Syncing follow-up rows…';

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
      type: 'SYNC_FOLLOW_UP_PRIOR',
    });

    if (!response?.tableFound) {
      statusEl.textContent = 'No follow-up table found with ref_no and prior columns.';
      return;
    }

    const failureCount = response.failures?.length ?? 0;
    statusEl.textContent =
      `Updated ${response.updatedRows}/${response.parsedRows} row(s). ` +
      `${failureCount} failure(s); see Granot tab Console for details.`;
  } catch {
    statusEl.textContent =
      'Could not sync. Reload the Granot page and confirm VITE_VANTAGE_API_SECRET is set.';
  }
});
