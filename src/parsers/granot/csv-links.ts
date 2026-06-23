import type { GranotCsvKind, GranotCsvLink } from "./csv-types";

const BOOK_CSV_RE = /\/book_advr\d+\.csv(?:\?.*)?$/i;
const FOLLOW_CSV_RE = /\/follow_advr\d+\.csv(?:\?.*)?$/i;

export function classifyCsvHref(href: string): GranotCsvKind | undefined {
  const normalized = href.trim();
  if (BOOK_CSV_RE.test(normalized)) {
    return "booked";
  }
  if (FOLLOW_CSV_RE.test(normalized)) {
    return "follow_up";
  }
  return undefined;
}

export function discoverGranotCsvLinks(
  root: ParentNode,
  frameUrl: string,
): GranotCsvLink[] {
  const links = new Map<string, GranotCsvLink>();

  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href")?.trim();
    if (!href) {
      continue;
    }

    const csvKind = classifyCsvHref(href);
    if (!csvKind) {
      continue;
    }

    const label = normalizeLinkLabel(anchor.textContent, csvKind);
    const key = `${csvKind}:${normalizeHrefKey(href)}`;
    if (!links.has(key)) {
      links.set(key, { csvKind, href, label, frameUrl });
    }
  }

  return [...links.values()].sort(compareCsvLinks);
}

function normalizeLinkLabel(text: string | null, csvKind: GranotCsvKind): string {
  const cleaned = (text ?? "").replace(/\s+/g, " ").trim();
  if (cleaned) {
    return cleaned;
  }
  return csvKind === "booked" ? "Download Booked to CSV" : "Download Follow Up to CSV";
}

function normalizeHrefKey(href: string): string {
  try {
    const url = new URL(href, "https://placeholder.local");
    return `${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return href.toLowerCase();
  }
}

function compareCsvLinks(a: GranotCsvLink, b: GranotCsvLink): number {
  if (a.csvKind !== b.csvKind) {
    return a.csvKind === "follow_up" ? -1 : 1;
  }
  return a.href.localeCompare(b.href);
}
