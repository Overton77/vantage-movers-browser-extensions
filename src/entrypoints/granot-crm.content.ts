import { GRANOT_URL_PATTERNS } from "../config";
import {
  CALL_LEAD_SECTIONS,
  parseCallLeadTables,
  type CallLeadPreviewResult,
} from "../parsers/granot/call-leads";
import {
  parseCurrentFormLead,
  type CurrentFormLeadParseResult,
} from "../parsers/granot/form-edit-lead";
import { parseFormLeadRows, type ParseResult } from "../parsers/granot/form-leads";
import { getSearchDocuments, logPageAndTables } from "../utils/page-scraper";
import { error as logError, log } from "../utils/logger";

export default defineContentScript({
  matches: [...GRANOT_URL_PATTERNS],
  allFrames: true,
  runAt: "document_idle",

  main() {
    const startedAt = new Date().toISOString();
    const manifest = browser.runtime.getManifest();

    log(
      `Content script v${manifest.version} active on`,
      window.location.href,
      "frame is top?",
      window.top === window,
    );

    // Always-on PING handler. Registered FIRST so even if the rest of main()
    // throws, the popup's Diagnose Page can still see this frame answered.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      try {
        if (message?.type === "PING") {
          sendResponse(buildPingResponse(manifest, startedAt));
          return true;
        }

        if (message?.type === "DUMP_TABLES") {
          const tables = logPageAndTables();
          sendResponse({ ok: true, tables });
          return true;
        }

        if (message?.type === "PARSE_FOLLOW_UP_ROWS") {
          sendResponse(parseFollowUpRowsFromSearchDocuments());
          return true;
        }

        if (message?.type === "PARSE_CURRENT_FORM_LEAD") {
          sendResponse(parseCurrentFormLeadFromSearchDocuments());
          return true;
        }

        if (message?.type === "PARSE_CALL_LEAD_TABLES") {
          sendResponse(parseCallLeadTablesFromSearchDocuments());
          return true;
        }
      } catch (err) {
        logError("Content script handler crashed for", message, err);
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return true;
      }

      return undefined;
    });

    try {
      // Log once on load, then again after 2s (Granot may render tables late)
      logPageAndTables();
      setTimeout(() => {
        log("Re-scanning page after delay…");
        try {
          logPageAndTables();
        } catch (err) {
          logError("Delayed re-scan failed:", err);
        }
      }, 2000);
    } catch (err) {
      logError("Initial page scan failed:", err);
    }
  },
});

function buildPingResponse(
  manifest: { name: string; version: string; manifest_version?: number },
  startedAt: string,
) {
  const tableCount = document.querySelectorAll("table").length;
  const headings = [...document.querySelectorAll("h1,h2,h3,h4")];
  const hasFollowUpHeading = headings.some((heading) =>
    (heading.textContent ?? "").toLowerCase().includes("follow up estimates"),
  );
  const hasBookedJobsHeading = headings.some((heading) =>
    (heading.textContent ?? "").toLowerCase().includes("booked jobs"),
  );

  return {
    ok: true,
    type: "PING_RESPONSE",
    extensionVersion: manifest.version,
    extensionName: manifest.name,
    runtimeId: browser.runtime.id,
    frameUrl: window.location.href,
    isTopFrame: window.top === window,
    documentReadyState: document.readyState,
    documentTitle: document.title,
    htmlLength: document.documentElement.outerHTML.length,
    tableCount,
    hasFollowUpHeading,
    hasBookedJobsHeading,
    startedAt,
    respondedAt: new Date().toISOString(),
  };
}

function parseCallLeadTablesFromSearchDocuments(): CallLeadPreviewResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseCallLeadTables(searchDocument.document);
    if (result.pageFound) {
      return result;
    }
  }

  const result = {
    ok: true,
    pageFound: false,
    sections: CALL_LEAD_SECTIONS.map((section) => ({
      key: section.key,
      title: section.title,
      tableFound: false,
      headers: [],
      rows: [],
    })),
  } satisfies CallLeadPreviewResult;
  log(
    "No Call Leads / Booked Call Leads tables found in page or accessible frames:",
    result,
  );
  return result;
}

function parseCurrentFormLeadFromSearchDocuments(): CurrentFormLeadParseResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseCurrentFormLead(
      searchDocument.document,
      searchDocument.frameUrl,
    );
    if (result.pageFound) {
      return result;
    }
  }

  const result = {
    ok: true,
    pageFound: false,
  } satisfies CurrentFormLeadParseResult;
  log(
    "No current form lead edit page found in page or accessible frames:",
    result,
  );
  return result;
}

function parseFollowUpRowsFromSearchDocuments(): ParseResult {
  for (const searchDocument of getSearchDocuments()) {
    const result = parseFormLeadRows(searchDocument.document);
    if (result.tableFound) {
      return result;
    }
  }

  const result = {
    ok: true,
    tableFound: false,
    rows: [],
    counts: { total: 0, syncable: 0, invalid: 0, unsupported: 0 },
  } satisfies ParseResult;
  log(
    "No Booked Jobs or Follow Up Estimates table found in page or accessible frames:",
    result,
  );
  return result;
}
