// Tab messaging boundary. Resolves the target Granot tab and sends parser
// messages to its content scripts, aggregating responses across frames (the
// content script runs with `allFrames: true`). Extracted from `popup/main.ts`
// in Unit 07 so both the popup and the background runner (Unit 08) can talk to
// Granot tabs through one transport instead of duplicating frame plumbing.

/**
 * Resolves the tab to message. When a `targetTabId` is provided (detached
 * popup window or background runner with a chosen tab) it is used directly;
 * otherwise the active tab in the current window is used.
 */
export async function getTargetTabId(targetTabId?: number): Promise<number> {
  if (typeof targetTabId === "number") {
    return targetTabId;
  }
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) {
    throw new Error("No active tab found");
  }
  return tab.id;
}

/**
 * Sends a message to the resolved Granot tab. Parser messages
 * (`PARSE_*`/`DUMP_TABLES`) are broadcast to every frame and the responses are
 * merged via {@link aggregateFrameResponses}; all other messages go to the
 * top frame only.
 */
export async function sendActiveTabMessage<T>(
  message: unknown,
  targetTabId?: number,
): Promise<T> {
  const tabId = await getTargetTabId(targetTabId);

  if (isFrameAggregatedMessage(message)) {
    const frames = await getTabFrames(tabId);
    const responses = await Promise.all(
      frames.map((frame) =>
        browser.tabs
          .sendMessage(tabId, message, { frameId: frame.frameId })
          .catch(() => undefined),
      ),
    );

    return aggregateFrameResponses<T>(message, responses);
  }

  return browser.tabs.sendMessage(tabId, message) as Promise<T>;
}

export function isFrameAggregatedMessage(
  message: unknown,
): message is { type: string } {
  return (
    isRecord(message) &&
    (message.type === "DUMP_TABLES" ||
      message.type === "PARSE_FOLLOW_UP_ROWS" ||
      message.type === "PARSE_CURRENT_FORM_LEAD" ||
      message.type === "PARSE_CALL_LEAD_TABLES")
  );
}

export async function getTabFrames(
  tabId: number,
): Promise<Array<{ frameId: number }>> {
  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const frameIds = frames
      ?.map((frame) => frame.frameId)
      .filter((frameId): frameId is number => typeof frameId === "number");
    return frameIds?.length
      ? frameIds.map((frameId) => ({ frameId }))
      : [{ frameId: 0 }];
  } catch {
    return [{ frameId: 0 }];
  }
}

export function aggregateFrameResponses<T>(
  message: { type: string },
  responses: unknown[],
): T {
  const validResponses = responses.filter(isRecord);

  if (message.type === "DUMP_TABLES") {
    return {
      ok: true,
      tables: validResponses.flatMap((response) =>
        Array.isArray(response.tables) ? response.tables : [],
      ),
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_FOLLOW_UP_ROWS") {
    const foundResponse = validResponses.find(
      (response) => response.tableFound === true,
    );
    const aggregated = foundResponse ?? {
      ok: true,
      tableFound: false,
      rows: [],
      counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
    };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_CURRENT_FORM_LEAD") {
    const foundResponse = validResponses.find(
      (response) => response.pageFound === true,
    );
    const aggregated = foundResponse ?? { ok: true, pageFound: false };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  if (message.type === "PARSE_CALL_LEAD_TABLES") {
    const foundResponse = validResponses.find(
      (response) => response.pageFound === true,
    );
    const aggregated = foundResponse ?? {
      ok: true,
      pageFound: false,
      sections: [],
    };
    return {
      ...aggregated,
      frameResponses: validResponses.length,
      frameCount: responses.length,
    } as T;
  }

  return validResponses[0] as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
