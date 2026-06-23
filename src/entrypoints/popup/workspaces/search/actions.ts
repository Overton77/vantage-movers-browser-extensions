// Search workspace actions. Read-only browsing of Vantage form / call leads via
// the server browse endpoints. No Granot scan and no sync: this workspace only
// queries and renders. Filters map directly onto `LeadBrowseQuery`.
import {
  browseCallLeads,
  browseFormLeads,
  type LeadBrowseQuery,
} from "../../../../utils/api";
import type { SearchEntity } from "../../../../app/state";
import type { AppContext } from "../../app/context";
import { savePersistedState } from "../../app/persistence";
import { setBusy } from "../../app/render";
import { setStatus } from "../../ui/status";
import { renderSearch } from "./render";

export function setSearchEntity(app: AppContext, entity: SearchEntity): void {
  if (app.state.search.entity === entity) return;
  app.state.search.entity = entity;
  app.state.search.hasSearched = false;
  app.state.search.formResults = [];
  app.state.search.callResults = [];
  app.state.search.count = 0;
  app.state.search.error = undefined;
  void savePersistedState(app.state);
  renderSearch(app);
}

export function clearSearch(app: AppContext): void {
  const sr = app.state.search;
  sr.query = { q: "", source_company: "", name: "", email: "", phone_number: "" };
  sr.formResults = [];
  sr.callResults = [];
  sr.count = 0;
  sr.error = undefined;
  sr.hasSearched = false;
  void savePersistedState(app.state);
  renderSearch(app);
}

function buildQuery(app: AppContext): LeadBrowseQuery {
  const { q, source_company, name, email, phone_number } = app.state.search.query;
  const query: LeadBrowseQuery = {};
  if (q.trim()) query.q = q.trim();
  if (source_company.trim()) query.source_company = source_company.trim();
  if (name.trim()) query.name = name.trim();
  if (email.trim()) query.email = email.trim();
  if (phone_number.trim()) query.phone_number = phone_number.trim();
  return query;
}

export async function runSearch(app: AppContext): Promise<void> {
  const { dom } = app;
  const sr = app.state.search;
  const query = buildQuery(app);

  void savePersistedState(app.state);
  setBusy(app, true);
  sr.loading = true;
  sr.error = undefined;
  setStatus(dom, "Searching Vantage…");
  renderSearch(app);

  try {
    if (sr.entity === "form-leads") {
      const { results, count } = await browseFormLeads(query);
      sr.formResults = results;
      sr.callResults = [];
      sr.count = count;
    } else {
      const { results, count } = await browseCallLeads(query);
      sr.callResults = results;
      sr.formResults = [];
      sr.count = count;
    }
    sr.hasSearched = true;
    const shown =
      sr.entity === "form-leads" ? sr.formResults.length : sr.callResults.length;
    setStatus(
      dom,
      `Found ${sr.count} match(es); showing ${shown}.`,
    );
  } catch (err) {
    sr.error = err instanceof Error ? err.message : String(err);
    sr.formResults = [];
    sr.callResults = [];
    sr.count = 0;
    sr.hasSearched = true;
    setStatus(dom, `Search failed: ${sr.error}`, { tone: "error" });
  } finally {
    sr.loading = false;
    setBusy(app, false);
    renderSearch(app);
  }
}
