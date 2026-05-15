import { log } from '../utils/logger';

export default defineBackground(() => {
  log('Background service worker started');

  browser.runtime.onInstalled.addListener(({ reason }) => {
    log('Extension installed/updated:', reason);
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === 'GRANOT_PAGE_DATA') {
      log('Received page data from tab', sender.tab?.id, message.payload);
      return Promise.resolve({ ok: true });
    }

    return undefined;
  });
});
