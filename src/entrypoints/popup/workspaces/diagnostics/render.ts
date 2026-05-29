// Diagnose workspace. Inspects the target Granot tab and every frame the
// content script should be injected into, then renders a frame-by-frame report
// so the owner can confirm the content script is alive. Extracted from
// `popup/main.ts` in Unit 07. The match-pattern + browser-detection helpers are
// diagnostics-only and stay local to this module.
import { GRANOT_URL_PATTERNS } from "../../../../config";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";

type FramePingResponse = {
  ok?: boolean;
  type?: string;
  extensionVersion?: string;
  extensionName?: string;
  runtimeId?: string;
  frameUrl?: string;
  isTopFrame?: boolean;
  documentReadyState?: string;
  documentTitle?: string;
  htmlLength?: number;
  tableCount?: number;
  hasFollowUpHeading?: boolean;
  hasBookedJobsHeading?: boolean;
  startedAt?: string;
  respondedAt?: string;
};

type FrameDiagnostic = {
  frameId: number;
  parentFrameId?: number;
  frameUrl?: string;
  pingResponse?: FramePingResponse;
  pingError?: string;
};

type DiagnosticsReport = {
  popupUrl: string;
  popupWindowId?: number;
  isDetached: boolean;
  targetTabId?: number;
  activeTabId?: number;
  activeTabUrl?: string;
  activeTabTitle?: string;
  activeWindowId?: number;
  matchPatterns: string[];
  matches: boolean;
  matchingPattern?: string;
  manifestVersion: string;
  manifestName: string;
  manifestRuntimeId: string;
  browser: "firefox" | "chrome" | "unknown";
  manifestVersionNumber: number;
  frames: FrameDiagnostic[];
  errors: string[];
};

export async function runAndRenderDiagnostics(app: AppContext): Promise<void> {
  const { dom } = app;
  setStatus(dom, "Running diagnostics…");
  dom.diagnoseOutput.textContent = "";
  setBusy(app, true);

  try {
    const report = await runDiagnostics(app);
    renderDiagnostics(app, report);
    setStatus(dom, summariseDiagnostics(report));
  } catch (err) {
    setStatus(
      dom,
      `Diagnostics crashed: ${err instanceof Error ? err.message : String(err)}`,
      { tone: "error" },
    );
  } finally {
    setBusy(app, false);
  }
}

async function runDiagnostics(app: AppContext): Promise<DiagnosticsReport> {
  const { targetTabId, isDetachedWindow } = app;
  const errors: string[] = [];
  const manifest = browser.runtime.getManifest();
  const matchPatterns = [...GRANOT_URL_PATTERNS];

  let popupWindowId: number | undefined;
  try {
    const popupWindow = await browser.windows.getCurrent();
    popupWindowId = popupWindow.id ?? undefined;
  } catch (err) {
    errors.push(
      `windows.getCurrent failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let activeTabId: number | undefined;
  let activeTabUrl: string | undefined;
  let activeTabTitle: string | undefined;
  let activeWindowId: number | undefined;

  try {
    if (typeof targetTabId === "number") {
      const tab = await browser.tabs.get(targetTabId);
      activeTabId = tab.id;
      activeTabUrl = tab.url;
      activeTabTitle = tab.title;
      activeWindowId = tab.windowId;
    } else {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      activeTabId = tab?.id;
      activeTabUrl = tab?.url;
      activeTabTitle = tab?.title;
      activeWindowId = tab?.windowId;
    }
  } catch (err) {
    errors.push(
      `tabs.query/get failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const matchingPattern = activeTabUrl
    ? matchPatterns.find((pattern) =>
        matchPatternMatches(pattern, activeTabUrl!),
      )
    : undefined;

  type FrameDetails = {
    frameId: number;
    parentFrameId?: number;
    url?: string;
  };

  let frames: FrameDetails[] | undefined;
  if (typeof activeTabId === "number") {
    try {
      const result = (await browser.webNavigation.getAllFrames({
        tabId: activeTabId,
      })) as FrameDetails[] | null | undefined;
      frames = result ?? undefined;
    } catch (err) {
      errors.push(
        `webNavigation.getAllFrames failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const frameSummaries: FrameDiagnostic[] = [];
  if (typeof activeTabId === "number") {
    const targets =
      frames && frames.length > 0
        ? frames.map((frame) => ({
            frameId: frame.frameId,
            parentFrameId: frame.parentFrameId,
            frameUrl: frame.url,
          }))
        : [{ frameId: 0, parentFrameId: undefined, frameUrl: activeTabUrl }];

    await Promise.all(
      targets.map(async (target) => {
        const summary: FrameDiagnostic = {
          frameId: target.frameId,
          parentFrameId: target.parentFrameId,
          frameUrl: target.frameUrl,
        };

        try {
          const response = await pingFrameWithTimeout(
            activeTabId!,
            target.frameId,
            1500,
          );
          summary.pingResponse = response;
        } catch (err) {
          summary.pingError = err instanceof Error ? err.message : String(err);
        }

        frameSummaries.push(summary);
      }),
    );

    frameSummaries.sort((a, b) => a.frameId - b.frameId);
  }

  const matches = Boolean(matchingPattern);
  return {
    popupUrl: window.location.href,
    popupWindowId,
    isDetached: isDetachedWindow,
    targetTabId,
    activeTabId,
    activeTabUrl,
    activeTabTitle,
    activeWindowId,
    matchPatterns,
    matches,
    matchingPattern,
    manifestVersion: manifest.version,
    manifestName: manifest.name,
    manifestRuntimeId: browser.runtime.id,
    browser: detectBrowserKind(),
    manifestVersionNumber: manifest.manifest_version,
    frames: frameSummaries,
    errors,
  };
}

async function pingFrameWithTimeout(
  tabId: number,
  frameId: number,
  timeoutMs: number,
): Promise<FramePingResponse | undefined> {
  return new Promise<FramePingResponse | undefined>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`timeout after ${timeoutMs}ms (no response)`));
    }, timeoutMs);

    browser.tabs
      .sendMessage(tabId, { type: "PING" }, { frameId })
      .then((response) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve((response as FramePingResponse | undefined) ?? undefined);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

function summariseDiagnostics(report: DiagnosticsReport): string {
  const responding = report.frames.filter((frame) => frame.pingResponse).length;
  const total = report.frames.length;

  if (!report.activeTabId) {
    return "No active tab found. Click the extension on the Granot tab, not on an extension page.";
  }
  if (!report.matches) {
    return `Active tab URL is NOT covered by content_scripts.matches. URL: ${report.activeTabUrl}`;
  }
  if (total === 0) {
    return "No frames returned by webNavigation. Reload the Granot tab.";
  }
  if (responding === 0) {
    return `0/${total} frames responded to PING. Content script never injected. Reload the tab and the add-on.`;
  }
  return `${responding}/${total} frames responded. See report below.`;
}

function renderDiagnostics(app: AppContext, report: DiagnosticsReport): void {
  const { dom } = app;
  dom.diagnoseOutput.textContent = "";

  const heading = document.createElement("p");
  heading.className = "status-text";
  heading.style.margin = "0 0 10px";
  heading.textContent = `${report.manifestName} v${report.manifestVersion} (${report.browser}, MV${report.manifestVersionNumber}) — runtime id ${report.manifestRuntimeId}`;
  dom.diagnoseOutput.append(heading);

  const container = document.createElement("div");
  container.className = "diag";

  const lines: Array<{ key: string; value: string; tone?: "good" | "bad" }> = [
    {
      key: "Popup URL",
      value: `${report.popupUrl} (window ${report.popupWindowId ?? "?"}${report.isDetached ? ", detached" : ""})`,
    },
    {
      key: "Target tab",
      value: `id=${report.activeTabId ?? "?"} window=${
        report.activeWindowId ?? "?"
      }${
        typeof report.targetTabId === "number"
          ? ` (pinned via targetTabId=${report.targetTabId})`
          : ""
      }`,
      tone: report.activeTabId == null ? "bad" : "good",
    },
    {
      key: "Tab URL",
      value: report.activeTabUrl ?? "(unknown)",
    },
    {
      key: "Tab title",
      value: report.activeTabTitle ?? "(unknown)",
    },
    {
      key: "URL matches content_scripts",
      value: report.matches
        ? `YES — pattern '${report.matchingPattern}'`
        : `NO — none of [${report.matchPatterns.join(", ")}] match this URL`,
      tone: report.matches ? "good" : "bad",
    },
    {
      key: "Frames",
      value: `${report.frames.length} reported by webNavigation`,
    },
  ];

  for (const line of lines) {
    container.append(buildDiagLine(line.key, line.value, line.tone));
  }
  for (const frame of report.frames) {
    container.append(buildFrameDiagBlock(frame));
  }
  if (report.errors.length > 0) {
    container.append(buildDiagLine("Errors", report.errors.join(" | "), "bad"));
  }
  container.append(
    buildDiagLine(
      "Hint",
      "If a frame says NOT RESPONDING but its URL matches one of the patterns, the content script never injected — usually because (a) you have the dev folder loaded but `pnpm dev` is not running, (b) the add-on was loaded before the manifest was rebuilt and needs Reload, or (c) Firefox has a stale duplicate of granot-sync@vantage.dev installed.",
    ),
  );

  dom.diagnoseOutput.append(container);
}

function buildDiagLine(
  key: string,
  value: string,
  tone?: "good" | "bad",
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "diag-row";
  const k = document.createElement("span");
  k.className = "diag-key";
  k.textContent = `${key}: `;
  const v = document.createElement("span");
  if (tone === "good") {
    v.className = "diag-good";
  } else if (tone === "bad") {
    v.className = "diag-bad";
  }
  v.textContent = value;
  wrapper.append(k, v);
  return wrapper;
}

function buildFrameDiagBlock(frame: FrameDiagnostic): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "diag-row";
  const responded = Boolean(frame.pingResponse);

  const header = document.createElement("div");
  const headerKey = document.createElement("span");
  headerKey.className = "diag-key";
  headerKey.textContent = `Frame ${frame.frameId}${
    typeof frame.parentFrameId === "number" && frame.parentFrameId !== -1
      ? ` (parent ${frame.parentFrameId})`
      : " (top)"
  }: `;
  const headerVal = document.createElement("span");
  headerVal.className = responded ? "diag-good" : "diag-bad";
  headerVal.textContent = responded
    ? `RESPONDING — content script v${frame.pingResponse?.extensionVersion}`
    : `NOT RESPONDING${frame.pingError ? ` (${frame.pingError})` : ""}`;
  header.append(headerKey, headerVal);
  wrapper.append(header);

  const url = document.createElement("div");
  const urlKey = document.createElement("span");
  urlKey.className = "diag-key";
  urlKey.textContent = "  url: ";
  const urlVal = document.createElement("span");
  urlVal.textContent = frame.frameUrl ?? "(unknown)";
  url.append(urlKey, urlVal);
  wrapper.append(url);

  if (frame.pingResponse) {
    const r = frame.pingResponse;
    const detail = document.createElement("div");
    detail.className = "diag-key";
    detail.textContent = `  ready=${r.documentReadyState} title="${r.documentTitle ?? ""}" htmlLen=${r.htmlLength ?? 0} tables=${r.tableCount ?? 0} followUpHeading=${r.hasFollowUpHeading ? "yes" : "no"} bookedJobsHeading=${r.hasBookedJobsHeading ? "yes" : "no"} startedAt=${r.startedAt}`;
    wrapper.append(detail);
  }

  return wrapper;
}

function matchPatternMatches(pattern: string, url: string): boolean {
  if (pattern === "<all_urls>") return true;

  const groups = /^(\*|https?|file|ftp):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!groups) return false;
  const [, protocolPart, hostPart, pathPart] = groups;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.replace(":", "");
  if (protocolPart !== "*") {
    if (protocolPart !== protocol) return false;
  } else if (protocol !== "http" && protocol !== "https") {
    return false;
  }

  const hostnameRegexes = [
    convertWildcardToRegex(hostPart),
    convertWildcardToRegex(hostPart.replace(/^\*\./, "")),
  ];
  if (!hostnameRegexes.some((rx) => rx.test(parsed.hostname))) {
    return false;
  }

  const pathRegex = convertWildcardToRegex(pathPart);
  return pathRegex.test(parsed.pathname);
}

function convertWildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function detectBrowserKind(): "firefox" | "chrome" | "unknown" {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/Firefox\//i.test(ua)) return "firefox";
  if (/Chrome\//i.test(ua) || /Edg\//i.test(ua)) return "chrome";
  return "unknown";
}
