import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import {
  buildCsvFileId,
  csvFilename,
  discoverGranotCsvLinks,
  downloadCsvText,
  fetchAllGranotCsvs,
  fetchGranotCsv,
} from "../../../../workflows/csv-sync/fetch";
import type { CsvFileSnapshot } from "../../../../workflows/csv-sync/types";
import { uploadCsvSnapshots } from "../../../../workflows/csv-sync/upload";
import { renderCsvWorkspace } from "./render";

export async function discoverCsvLinks(app: AppContext): Promise<void> {
  const { dom, state } = app;
  setBusy(app, true);
  setStatus(dom, "Discovering CSV download links on the Granot tab…");
  try {
    const response = await discoverGranotCsvLinks(app.targetTabId);
    if ((response.frameResponses ?? 0) === 0) {
      state.csv.error =
        "Content script did not respond. Reload the Granot tab and try again.";
      state.csv.discoveredLinks = [];
      state.csv.hasDiscovered = true;
      renderCsvWorkspace(app);
      setStatus(dom, state.csv.error, { tone: "error" });
      return;
    }

    state.csv.error = undefined;
    state.csv.discoveredLinks = response.links ?? [];
    state.csv.crmOrigin = response.crmOrigin;
    state.csv.hasDiscovered = true;
    state.csv.files = (response.links ?? []).map((link) => ({
      id: buildCsvFileId(link),
      csvKind: link.csvKind,
      href: link.href,
      label: link.label,
      frameUrl: link.frameUrl,
      status: "idle",
    }));

    const count = state.csv.discoveredLinks.length;
    const message =
      count > 0
        ? `Found ${count} CSV link(s) across ${response.frameResponses}/${response.frameCount} frame(s).`
        : "No CSV download links found on this page. Open a Granot view with Booked Jobs / Follow Up Estimates.";
    renderCsvWorkspace(app);
    setStatus(dom, message, { tone: count > 0 ? undefined : "error" });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to discover CSV links.";
    state.csv.error = message;
    renderCsvWorkspace(app);
    setStatus(dom, message, { tone: "error" });
  } finally {
    setBusy(app, false);
  }
}

export async function fetchCsvFile(
  app: AppContext,
  fileId: string,
): Promise<void> {
  const snapshot = app.state.csv.files.find((file) => file.id === fileId);
  if (!snapshot) {
    return;
  }
  await fetchCsvSnapshots(app, [snapshot]);
}

export async function fetchAllCsvFiles(app: AppContext): Promise<void> {
  const pending = app.state.csv.files.filter((file) => file.status !== "loading");
  if (pending.length === 0) {
    return;
  }
  await fetchCsvSnapshots(app, pending);
}

export async function uploadCsvFile(
  app: AppContext,
  fileId: string,
): Promise<void> {
  const snapshot = app.state.csv.files.find((file) => file.id === fileId);
  if (!snapshot) {
    return;
  }
  await uploadReadyCsvFiles(app, [snapshot]);
}

export async function uploadAllReadyCsvFiles(app: AppContext): Promise<void> {
  const ready = app.state.csv.files.filter((file) => file.csvText);
  if (ready.length === 0) {
    setStatus(app.dom, "Fetch at least one CSV before uploading.", { tone: "error" });
    return;
  }
  await uploadReadyCsvFiles(app, ready);
}

async function fetchCsvSnapshots(
  app: AppContext,
  snapshots: CsvFileSnapshot[],
): Promise<void> {
  const { dom, state } = app;
  setBusy(app, true);
  setStatus(dom, `Fetching ${snapshots.length} CSV file(s)…`);

  try {
    for (const snapshot of snapshots) {
      updateFileSnapshot(state, snapshot.id, { status: "loading", error: undefined });
      renderCsvWorkspace(app);

      const result = await fetchGranotCsv(snapshot.href, app.targetTabId);
      if (!result.ok || !result.csvText) {
        updateFileSnapshot(state, snapshot.id, {
          status: "error",
          error: result.error ?? "CSV fetch failed.",
        });
        continue;
      }

      updateFileSnapshot(state, snapshot.id, {
        status: "ready",
        fetchedAt: new Date().toISOString(),
        csvText: result.csvText,
        byteLength: result.byteLength,
        parsed: {
          ok: true,
          csvKind: result.csvKind,
          headers: result.headers,
          rows: result.rows,
          counts: result.counts,
        },
        error: undefined,
      });
    }

    const readyCount = state.csv.files.filter((file) => file.status === "ready").length;
    const failedCount = state.csv.files.filter((file) => file.status === "error").length;
    renderCsvWorkspace(app);
    setStatus(
      dom,
      failedCount > 0
        ? `Fetched ${readyCount} CSV file(s); ${failedCount} failed.`
        : `Fetched and parsed ${readyCount} CSV file(s).`,
      { tone: failedCount > 0 ? "error" : undefined },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV fetch failed.";
    state.csv.error = message;
    renderCsvWorkspace(app);
    setStatus(dom, message, { tone: "error" });
  } finally {
    setBusy(app, false);
  }
}

export function downloadCsvSnapshot(app: AppContext, fileId: string): void {
  const snapshot = app.state.csv.files.find((file) => file.id === fileId);
  if (!snapshot?.csvText) {
    return;
  }
  downloadCsvText(csvFilename(snapshot.href), snapshot.csvText);
  setStatus(app.dom, `Downloaded ${csvFilename(snapshot.href)}.`);
}

async function uploadReadyCsvFiles(
  app: AppContext,
  snapshots: CsvFileSnapshot[],
): Promise<void> {
  const { dom, state } = app;
  setBusy(app, true);
  setStatus(dom, `Uploading ${snapshots.length} CSV file(s) to S3…`);

  for (const snapshot of snapshots) {
    updateFileSnapshot(state, snapshot.id, { status: "uploading", error: undefined });
  }
  renderCsvWorkspace(app);

  try {
    const outcomes = await uploadCsvSnapshots({
      crmOrigin: state.csv.crmOrigin,
      files: snapshots,
    });
    for (const outcome of outcomes) {
      if (outcome.ok && outcome.result) {
        updateFileSnapshot(state, outcome.fileId, {
          status: "uploaded",
          uploadStatus: outcome.result.status,
          uploadResult: outcome.result,
          uploadedAt: new Date().toISOString(),
          error: undefined,
        });
      } else {
        updateFileSnapshot(state, outcome.fileId, {
          status: "error",
          error: outcome.error ?? "Upload failed.",
        });
      }
    }

    const uploadedCount = outcomes.filter((outcome) => outcome.ok).length;
    const failedCount = outcomes.length - uploadedCount;
    renderCsvWorkspace(app);
    setStatus(
      dom,
      failedCount > 0
        ? `Uploaded ${uploadedCount} CSV file(s); ${failedCount} failed.`
        : `Uploaded ${uploadedCount} CSV file(s) to S3.`,
      { tone: failedCount > 0 ? "error" : undefined },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV upload failed.";
    for (const snapshot of snapshots) {
      updateFileSnapshot(state, snapshot.id, {
        status: "error",
        error: message,
      });
    }
    renderCsvWorkspace(app);
    setStatus(dom, message, { tone: "error" });
  } finally {
    setBusy(app, false);
  }
}

export function toggleCsvFileOpen(app: AppContext, fileId: string, open: boolean): void {
  if (open) {
    app.state.csv.openFileIds.add(fileId);
  } else {
    app.state.csv.openFileIds.delete(fileId);
  }
}

function updateFileSnapshot(
  state: AppContext["state"],
  fileId: string,
  patch: Partial<CsvFileSnapshot>,
): void {
  state.csv.files = state.csv.files.map((file) =>
    file.id === fileId ? { ...file, ...patch } : file,
  );
}

export async function discoverAndFetchAllCsv(app: AppContext): Promise<void> {
  await discoverCsvLinks(app);
  if (app.state.csv.discoveredLinks.length === 0) {
    return;
  }
  await fetchAllCsvFiles(app);
}
