import { GRANOT_URL_PATTERNS } from "../config";
import {
  CALL_LEAD_SECTIONS,
  parseCallLeadTables,
  type CallLeadPreviewResult,
} from "../parsers/granot/call-leads";
import {
  applyBindingEstimateFeeFromInitialPrice,
  parseCurrentFormLead,
  type BindingEstimateFeeApplyResult,
  type CurrentFormLeadParseResult,
} from "../parsers/granot/form-edit-lead";
import { classifyCsvHref, discoverGranotCsvLinks } from "../parsers/granot/csv-links";
import { parseGranotCsv } from "../parsers/granot/csv";
import type { GranotCsvLink } from "../parsers/granot/csv-types";
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

        if (message?.type === "APPLY_BINDING_ESTIMATE_FEE") {
          sendResponse(applyBindingEstimateFeeInCurrentDocument());
          return true;
        }

        if (message?.type === "PARSE_CALL_LEAD_TABLES") {
          sendResponse(parseCallLeadTablesFromSearchDocuments());
          return true;
        }

        if (message?.type === "DISCOVER_CRM_CSV_LINKS") {
          sendResponse(discoverCsvLinksFromSearchDocuments());
          return true;
        }

        if (message?.type === "FETCH_CRM_CSV") {
          void fetchCrmCsv(String(message.href ?? ""))
            .then(sendResponse)
            .catch((err) => {
              sendResponse({
                ok: false,
                href: String(message.href ?? ""),
                error: err instanceof Error ? err.message : String(err),
              });
            });
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

function applyBindingEstimateFeeInCurrentDocument(): BindingEstimateFeeApplyResult {
  const result = applyBindingEstimateFeeFromInitialPrice(document);
  log("Applied Binding Estimate Fee helper:", result);
  return result;
}

function discoverCsvLinksFromSearchDocuments() {
  const links = new Map<string, GranotCsvLink>();

  for (const searchDocument of getSearchDocuments()) {
    for (const link of discoverGranotCsvLinks(
      searchDocument.document,
      searchDocument.frameUrl,
    )) {
      links.set(`${link.csvKind}:${link.href}`, link);
    }
  }

  const discovered = [...links.values()];
  const result = {
    ok: true,
    links: discovered,
    crmOrigin: window.location.origin,
  };
  log("Discovered Granot CRM CSV links:", result);
  return result;
}

async function fetchCrmCsv(href: string) {
  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return {
      ok: false,
      href: trimmedHref,
      error: "Missing CSV href.",
    };
  }

  const csvKind = classifyCsvHref(trimmedHref);
  const url = new URL(trimmedHref, window.location.origin).href;
  log("Fetching Granot CRM CSV:", url);

  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      ok: false,
      href: trimmedHref,
      error: `HTTP ${response.status} ${response.statusText}`,
      frameUrl: window.location.href,
    };
  }

  const csvText = await response.text();
  const parsed = parseGranotCsv(csvText, csvKind);
  const result = {
    href: trimmedHref,
    csvKind,
    csvText,
    byteLength: new TextEncoder().encode(csvText).length,
    frameUrl: window.location.href,
    ...parsed,
  };
  log("Fetched Granot CRM CSV:", {
    href: trimmedHref,
    byteLength: result.byteLength,
    counts: parsed.counts,
  });
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
