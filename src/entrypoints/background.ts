import {
  runBackgroundAutoSync,
} from '../auto-sync/background-runner';
import {
  AUTOMATED_SYNC_SETTINGS_KEY,
  loadAutomatedSyncSettings,
} from '../auto-sync/settings';
import { log } from '../utils/logger';

/** Named alarm that drives unattended background Scan-and-Sync (Unit 08). */
const AUTO_SYNC_ALARM = 'granot-sync:auto-sync';

/**
 * Creates/updates the alarm when automation is enabled and clears it when
 * disabled. Called on install, on browser startup, and whenever the settings
 * change in storage so the schedule always reflects the current settings.
 */
async function reconcileAutoSyncAlarm(): Promise<void> {
  try {
    const settings = await loadAutomatedSyncSettings();
    if (settings.enabled) {
      await browser.alarms.create(AUTO_SYNC_ALARM, {
        periodInMinutes: settings.intervalMinutes,
        delayInMinutes: settings.intervalMinutes,
      });
      log('Auto-sync alarm scheduled every', settings.intervalMinutes, 'min');
    } else {
      await browser.alarms.clear(AUTO_SYNC_ALARM);
      log('Auto-sync alarm cleared (disabled)');
    }
  } catch (err) {
    log('Failed to reconcile auto-sync alarm:', err);
  }
}

export default defineBackground(() => {
  log('Background service worker started');

  browser.runtime.onInstalled.addListener(({ reason }) => {
    log('Extension installed/updated:', reason);
    void reconcileAutoSyncAlarm();
  });

  // Recreate the alarm after a browser restart / service-worker wake-up.
  browser.runtime.onStartup.addListener(() => {
    void reconcileAutoSyncAlarm();
  });

  // Keep the schedule in sync with settings changes made from the popup.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && AUTOMATED_SYNC_SETTINGS_KEY in changes) {
      void reconcileAutoSyncAlarm();
    }
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_SYNC_ALARM) {
      void runBackgroundAutoSync();
    }
  });

  // Make sure an alarm exists on first load of this worker instance.
  void reconcileAutoSyncAlarm();

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'GRANOT_PAGE_DATA') {
      log('Received page data from tab', sender.tab?.id, message.payload);
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });
});
