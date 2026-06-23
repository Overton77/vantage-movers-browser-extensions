import { sendActiveTabMessage } from "../../messaging/tabs";
import type {
  DiscoverGranotCsvLinksResult,
  FetchGranotCsvResult,
  GranotCsvLink,
} from "./types";

export async function discoverGranotCsvLinks(
  targetTabId?: number,
): Promise<DiscoverGranotCsvLinksResult> {
  return sendActiveTabMessage<DiscoverGranotCsvLinksResult>(
    { type: "DISCOVER_CRM_CSV_LINKS" },
    targetTabId,
  );
}

export async function fetchGranotCsv(
  href: string,
  targetTabId?: number,
): Promise<FetchGranotCsvResult> {
  return sendActiveTabMessage<FetchGranotCsvResult>(
    { type: "FETCH_CRM_CSV", href },
    targetTabId,
  );
}

export async function fetchAllGranotCsvs(
  links: GranotCsvLink[],
  targetTabId?: number,
): Promise<FetchGranotCsvResult[]> {
  const results: FetchGranotCsvResult[] = [];
  for (const link of links) {
    results.push(await fetchGranotCsv(link.href, targetTabId));
  }
  return results;
}

export function buildCsvFileId(link: GranotCsvLink): string {
  return `${link.csvKind}:${link.href}`;
}

export function downloadCsvText(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function csvFilename(href: string): string {
  const basename = href.split("/").pop() ?? "granot.csv";
  return basename.includes(".csv") ? basename : `${basename}.csv`;
}
