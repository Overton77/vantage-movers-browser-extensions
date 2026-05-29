// Form Edit Lead workspace actions. Scans the current Granot Edit Form Lead
// page, previews it against Vantage, and PATCHes the single lead's `quoted`
// value (honoring the override radios). Extracted from `popup/main.ts` in
// Unit 07. Reuses the shared Form Leads sync orchestration.
import { getFormLeadById, updateFormLead } from "../../../../utils/api";
import { syncLeadCandidates as runSyncLeadCandidates } from "../../../../workflows/form-leads/sync";
import type {
  CurrentFormLeadParseResponse,
  LeadSyncCandidate,
} from "../../../../workflows/form-leads/types";
import { sendActiveTabMessage } from "../../../../messaging/tabs";
import type { AppContext } from "../../app/context";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderFormEditLead } from "./render";

export async function loadCurrentLeadPreview(
  app: AppContext,
  options: { preserveOverride: boolean; quiet?: boolean },
): Promise<boolean> {
  const { dom } = app;
  const fe = app.state.formEditLead;
  if (!options.quiet) {
    setStatus(dom, "Scanning current Granot page…");
  }
  setBusy(app, true);

  try {
    const response = await sendActiveTabMessage<CurrentFormLeadParseResponse>(
      { type: "PARSE_CURRENT_FORM_LEAD" },
      app.targetTabId,
    );

    if (!options.preserveOverride) {
      fe.override = "parsed";
      fe.result = undefined;
    }

    if (!response?.pageFound || !response.lead) {
      fe.preview = undefined;
      renderFormEditLead(app);
      if (!options.quiet) {
        setStatus(dom, "No CRM form edit lead found on this tab.", {
          tone: "error",
        });
      }
      return false;
    }

    fe.preview = { lead: response.lead };

    if (response.lead.status !== "invalid_ref_no") {
      try {
        const current = await getFormLeadById(response.lead.refNo);
        fe.preview = {
          lead: response.lead,
          currentQuoted: current.quoted,
          currentCubicFeet: current.cubic_feet,
          currentBooked: current.booked ?? undefined,
        };
      } catch (err) {
        fe.preview = {
          lead: response.lead,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    renderFormEditLead(app);
    if (!options.quiet) {
      setStatus(dom, response.lead.reason ?? "Current lead preview ready.");
    }
    return true;
  } catch (err) {
    fe.preview = undefined;
    renderFormEditLead(app);
    if (!options.quiet) {
      setStatus(
        dom,
        `Could not scan current page: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { tone: "error" },
      );
    }
    return false;
  } finally {
    setBusy(app, false);
  }
}

export async function syncCurrentLead(app: AppContext): Promise<void> {
  const { dom } = app;
  const fe = app.state.formEditLead;
  const refreshed = await loadCurrentLeadPreview(app, {
    preserveOverride: true,
    quiet: true,
  });

  if (!refreshed) {
    setStatus(dom, "Could not re-scan the current lead. Reload the Granot page.", {
      tone: "error",
    });
    return;
  }

  if (!fe.preview) {
    setStatus(dom, "No current lead preview is available.", { tone: "error" });
    return;
  }

  const targetQuoted = getCurrentLeadTargetQuoted(app);
  if (typeof targetQuoted !== "boolean") {
    fe.result = {
      status: "skipped",
      message:
        "Choose an override or use a parsed Level-0/Level-1 before syncing.",
    };
    renderFormEditLead(app);
    setStatus(dom, fe.result.message, { tone: "error" });
    return;
  }

  setBusy(app, true);
  setStatus(dom, "Syncing current lead…");
  const candidate = {
    ...fe.preview.lead,
    quoted: targetQuoted,
    status: "syncable",
  } satisfies LeadSyncCandidate;

  const results = await runSyncLeadCandidates(
    [candidate],
    { getFormLeadById, updateFormLead },
    (id, result) => {
      if (id === candidate.id) {
        fe.result = result;
        renderFormEditLead(app);
      }
    },
  );

  setStatus(
    dom,
    `Sync complete. Updated ${results.updated}, unchanged ${results.unchanged}, failed ${results.failed}.`,
  );
  setBusy(app, false);
  renderFormEditLead(app);
}

export function getCurrentLeadTargetQuoted(
  app: AppContext,
): boolean | undefined {
  const fe = app.state.formEditLead;
  if (!fe.preview) return undefined;
  if (fe.override === "quoted_false") return false;
  if (fe.override === "quoted_true") return true;
  return fe.preview.lead.quoted;
}

export function canSyncCurrentLead(app: AppContext): boolean {
  const fe = app.state.formEditLead;
  if (!fe.preview || fe.preview.lead.status === "invalid_ref_no") {
    return false;
  }
  return typeof getCurrentLeadTargetQuoted(app) === "boolean";
}
