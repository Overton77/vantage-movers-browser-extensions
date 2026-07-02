// Sales Rep attribution control — shared between the call-leads and
// form-leads workspaces. Renders the "who received this lead" flow described
// in the Agent-to-Lead Attribution build plan: already-linked display, single/
// multiple pattern-match confirmation (against Granot's `user`/`rep` column),
// and a create/edit-or-pick dialog fallback. All per-row UI state here is
// ephemeral (`app.state.agents`) and is never persisted — see the "do not
// persist scan results" rule in `app/persistence.ts`, which this mirrors.
import {
  createAgent,
  linkReceiverAgent,
  listAgents,
  type Agent,
  type ReceiverAgentSource,
} from "../../../api/agents";
import {
  matchAgentByCrmUsername,
  matchAgentsByFirstName,
} from "../../../workflows/agents/match";
import type { SalesRepDialogState } from "../../../app/state";
import type { AppContext } from "../app/context";
import { setStatus } from "./status";

export type SalesRepControlOptions = {
  /** Unique key for this row's ephemeral UI state, e.g. `call:<row_id>` or `form:<row.id>`. */
  rowKey: string;
  leadKind: "call" | "form";
  /** Resolved Vantage lead id. The control renders nothing until this is known. */
  leadId?: string;
  /** Raw Granot `user`/`rep` column text for this row, if captured. */
  rawValue?: string;
  /** Already-linked agent name snapshot from the preview/result, if any. */
  linkedName?: string;
  /** Re-invokes the owning workspace's top-level render (e.g. `renderCallLeads`). */
  rerender: () => void;
};

export function isOwnerSession(app: AppContext): boolean {
  return app.state.auth.session?.user.role === "owner";
}

export async function ensureAgentsLoaded(
  app: AppContext,
  options: { force?: boolean } = {},
): Promise<void> {
  const agents = app.state.agents;
  if (agents.loading) return;
  if (agents.loaded && !options.force) return;

  agents.loading = true;
  agents.error = undefined;

  try {
    agents.items = await listAgents({ includeInactive: true });
    agents.loaded = true;
  } catch (err) {
    agents.error = err instanceof Error ? err.message : String(err);
  } finally {
    agents.loading = false;
  }
}

export function buildSalesRepControl(
  app: AppContext,
  opts: SalesRepControlOptions,
): HTMLElement | undefined {
  if (!opts.leadId || !isOwnerSession(app)) {
    return undefined;
  }

  const agents = app.state.agents;
  const wrapper = document.createElement("div");
  wrapper.className = "sales-rep";

  const label = document.createElement("span");
  label.className = "sales-rep__label";
  label.textContent = "Sales Rep";
  wrapper.append(label);

  const linkedName = agents.linkedOverrides.get(opts.rowKey) ?? opts.linkedName;
  const dialog = agents.dialogs.get(opts.rowKey);

  if (linkedName && !agents.changeRequested.has(opts.rowKey)) {
    wrapper.append(buildLinkedRow(app, opts, linkedName));
    return wrapper;
  }

  if (!agents.loaded) {
    const status = document.createElement("span");
    status.className = "status-text";
    status.textContent = agents.loading
      ? "Loading agents…"
      : agents.error
        ? `Could not load agents: ${agents.error}`
        : "Agents not loaded yet.";
    wrapper.append(status);
    if (!agents.loading) {
      void ensureAgentsLoaded(app).then(opts.rerender);
    }
    return wrapper;
  }

  if (dialog) {
    wrapper.append(buildDialog(app, opts, dialog));
    return wrapper;
  }

  const rawValue = opts.rawValue?.trim();

  if (!rawValue) {
    if (agents.closedRowKeys.has(opts.rowKey)) {
      wrapper.append(buildReopenButton(app, opts));
      return wrapper;
    }
    openDialog(app, opts.rowKey, "");
    wrapper.append(buildDialog(app, opts, agents.dialogs.get(opts.rowKey)!));
    return wrapper;
  }

  const crmMatch = matchAgentByCrmUsername(rawValue, agents.items);
  const match = matchAgentsByFirstName(rawValue, agents.items);

  if (agents.closedRowKeys.has(opts.rowKey)) {
    wrapper.append(buildReopenButton(app, opts));
    return wrapper;
  }

  if (crmMatch.status === "single") {
    wrapper.append(
      buildSingleMatchPrompt(
        app,
        opts,
        rawValue,
        crmMatch.candidate,
        "extension_crm_username_match",
        `CRM username ${crmMatch.username} → ${formatAgentLabel(crmMatch.candidate)}?`,
      ),
    );
    return wrapper;
  }

  if (match.status === "single") {
    wrapper.append(buildSingleMatchPrompt(app, opts, rawValue, match.candidates[0]));
    return wrapper;
  }

  if (match.status === "multiple") {
    wrapper.append(buildMultiMatchList(app, opts, rawValue, match.candidates));
    return wrapper;
  }

  // Zero matches: skip straight to the create/edit dialog per the interview decision.
  openDialog(app, opts.rowKey, rawValue);
  wrapper.append(buildDialog(app, opts, agents.dialogs.get(opts.rowKey)!));
  return wrapper;
}

function buildLinkedRow(
  app: AppContext,
  opts: SalesRepControlOptions,
  linkedName: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "sales-rep__row";

  const badge = document.createElement("span");
  badge.className = "badge ok";
  badge.textContent = linkedName;
  row.append(badge);

  const change = document.createElement("button");
  change.type = "button";
  change.className = "btn-ghost btn-sm";
  change.textContent = "Change";
  change.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    app.state.agents.changeRequested.add(opts.rowKey);
    app.state.agents.closedRowKeys.delete(opts.rowKey);
    void ensureAgentsLoaded(app).then(opts.rerender);
    opts.rerender();
  });
  row.append(change);

  return row;
}

function buildReopenButton(
  app: AppContext,
  opts: SalesRepControlOptions,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "sales-rep__row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost btn-sm";
  button.textContent = opts.rawValue?.trim()
    ? `Link Sales Rep (Granot: ${opts.rawValue.trim()})`
    : "Link Sales Rep";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    app.state.agents.closedRowKeys.delete(opts.rowKey);
    opts.rerender();
  });
  row.append(button);

  return row;
}

function buildSingleMatchPrompt(
  app: AppContext,
  opts: SalesRepControlOptions,
  rawValue: string,
  candidate: Agent,
  source: ReceiverAgentSource = "extension_match",
  promptText?: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "sales-rep__row";
  const busy = app.state.agents.busyRowKeys.has(opts.rowKey);

  const question = document.createElement("span");
  question.className = "status-text";
  question.textContent = promptText ?? `Granot: ${rawValue} → ${formatAgentLabel(candidate)}?`;
  row.append(question);

  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "btn-sm";
  yes.textContent = "Yes";
  yes.disabled = busy;
  yes.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void linkAgentToRow(app, opts, candidate, source, rawValue);
  });
  row.append(yes);

  const no = document.createElement("button");
  no.type = "button";
  no.className = "btn-secondary btn-sm";
  no.textContent = "No";
  no.disabled = busy;
  no.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDialog(app, opts.rowKey, rawValue);
    opts.rerender();
  });
  row.append(no);

  return row;
}

function buildMultiMatchList(
  app: AppContext,
  opts: SalesRepControlOptions,
  rawValue: string,
  candidates: Agent[],
): HTMLElement {
  const wrapper = document.createElement("div");

  const question = document.createElement("span");
  question.className = "status-text";
  question.textContent = `Granot: ${rawValue} matched ${candidates.length} agents. Which one?`;
  wrapper.append(question);

  const list = document.createElement("div");
  list.className = "sales-rep__candidates";
  const busy = app.state.agents.busyRowKeys.has(opts.rowKey);

  for (const candidate of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary btn-sm";
    button.textContent = formatAgentLabel(candidate);
    button.disabled = busy;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void linkAgentToRow(app, opts, candidate, "extension_match", rawValue);
    });
    list.append(button);
  }

  const none = document.createElement("button");
  none.type = "button";
  none.className = "btn-ghost btn-sm";
  none.textContent = "None of these";
  none.disabled = busy;
  none.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDialog(app, opts.rowKey, rawValue);
    opts.rerender();
  });
  list.append(none);

  wrapper.append(list);
  return wrapper;
}

function buildDialog(
  app: AppContext,
  opts: SalesRepControlOptions,
  dialogState: SalesRepDialogState,
): HTMLElement {
  const busy = app.state.agents.busyRowKeys.has(opts.rowKey);
  const wrapper = document.createElement("div");
  wrapper.className = "sales-rep__dialog";

  if (dialogState.error) {
    const error = document.createElement("div");
    error.className = "banner error";
    error.textContent = dialogState.error;
    wrapper.append(error);
  }

  // --- Create a new agent -------------------------------------------------
  const createSection = document.createElement("div");
  createSection.className = "sales-rep__dialog-section";

  const createHeading = document.createElement("span");
  createHeading.className = "sales-rep__dialog-heading";
  createHeading.textContent = "Create new agent";
  createSection.append(createHeading);

  const nameRow = document.createElement("div");
  nameRow.className = "sales-rep__dialog-row";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Agent name";
  nameInput.value = dialogState.name;
  nameInput.disabled = busy;
  nameInput.addEventListener("click", (event) => event.stopPropagation());
  nameInput.addEventListener("input", () => {
    dialogState.name = nameInput.value;
  });
  nameRow.append(nameInput);

  const roleInput = document.createElement("input");
  roleInput.type = "text";
  roleInput.placeholder = "role";
  roleInput.style.maxWidth = "90px";
  roleInput.value = dialogState.role;
  roleInput.disabled = busy;
  roleInput.addEventListener("click", (event) => event.stopPropagation());
  roleInput.addEventListener("input", () => {
    dialogState.role = roleInput.value;
  });
  nameRow.append(roleInput);

  const activeLabel = document.createElement("label");
  const activeCheckbox = document.createElement("input");
  activeCheckbox.type = "checkbox";
  activeCheckbox.checked = dialogState.active;
  activeCheckbox.disabled = busy;
  activeCheckbox.addEventListener("click", (event) => event.stopPropagation());
  activeCheckbox.addEventListener("change", () => {
    dialogState.active = activeCheckbox.checked;
  });
  activeLabel.append(activeCheckbox, document.createTextNode("active"));
  nameRow.append(activeLabel);
  createSection.append(nameRow);

  const createActions = document.createElement("div");
  createActions.className = "sales-rep__dialog-row";
  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className = "btn-sm";
  createBtn.textContent = "Create & Link";
  createBtn.disabled = busy || dialogState.name.trim().length === 0;
  createBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void createAndLinkAgent(app, opts, dialogState);
  });
  createActions.append(createBtn);
  createSection.append(createActions);

  wrapper.append(createSection);

  const divider = document.createElement("hr");
  divider.className = "sales-rep__dialog-divider";
  wrapper.append(divider);

  // --- Search/pick an existing agent --------------------------------------
  const pickSection = document.createElement("div");
  pickSection.className = "sales-rep__dialog-section";

  const pickHeading = document.createElement("span");
  pickHeading.className = "sales-rep__dialog-heading";
  pickHeading.textContent = "…or pick an existing agent";
  pickSection.append(pickHeading);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search agents by name…";
  searchInput.value = dialogState.searchQuery;
  searchInput.disabled = busy;
  searchInput.addEventListener("click", (event) => event.stopPropagation());
  searchInput.addEventListener("input", () => {
    dialogState.searchQuery = searchInput.value;
    resultsList.replaceChildren(...buildSearchResults(app, opts, dialogState));
  });
  pickSection.append(searchInput);

  const resultsList = document.createElement("div");
  resultsList.className = "sales-rep__search-results";
  resultsList.append(...buildSearchResults(app, opts, dialogState));
  pickSection.append(resultsList);

  wrapper.append(pickSection);

  const cancelRow = document.createElement("div");
  cancelRow.className = "sales-rep__dialog-row";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn-ghost btn-sm";
  cancel.textContent = "Cancel";
  cancel.disabled = busy;
  cancel.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeDialog(app, opts.rowKey);
    opts.rerender();
  });
  cancelRow.append(cancel);
  wrapper.append(cancelRow);

  return wrapper;
}

function buildSearchResults(
  app: AppContext,
  opts: SalesRepControlOptions,
  dialogState: SalesRepDialogState,
): HTMLElement[] {
  const query = dialogState.searchQuery.trim().toLowerCase();
  const busy = app.state.agents.busyRowKeys.has(opts.rowKey);
  if (!query) {
    return [];
  }

  const matches = app.state.agents.items
    .filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.granot_crm_username?.toLowerCase().includes(query),
    )
    .slice(0, 8);

  if (matches.length === 0) {
    const empty = document.createElement("span");
    empty.className = "sales-rep__search-empty";
    empty.textContent = "No agents match.";
    return [empty];
  }

  return matches.map((agent) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary btn-sm";
    button.style.justifyContent = "flex-start";
    button.textContent = formatAgentLabel(agent);
    button.disabled = busy;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void linkAgentToRow(app, opts, agent, "extension_selected", opts.rawValue);
    });
    return button;
  });
}

function openDialog(app: AppContext, rowKey: string, prefillName: string): void {
  app.state.agents.dialogs.set(rowKey, {
    name: prefillName,
    role: "agent",
    active: true,
    searchQuery: "",
  });
  app.state.agents.closedRowKeys.delete(rowKey);
}

function closeDialog(app: AppContext, rowKey: string): void {
  app.state.agents.dialogs.delete(rowKey);
  app.state.agents.closedRowKeys.add(rowKey);
}

function formatAgentLabel(agent: Agent): string {
  const parts = [agent.name];
  if (agent.granot_crm_username) {
    parts.push(`CRM ${agent.granot_crm_username}`);
  }
  if (!agent.active) {
    parts.push("inactive");
  }
  return parts.join(" · ");
}

async function linkAgentToRow(
  app: AppContext,
  opts: SalesRepControlOptions,
  agent: Agent,
  source: ReceiverAgentSource,
  rawValue?: string,
): Promise<void> {
  const agents = app.state.agents;
  agents.busyRowKeys.add(opts.rowKey);
  opts.rerender();

  try {
    const result = await linkReceiverAgent(opts.leadKind, opts.leadId!, {
      receiver_agent: agent._id,
      receiver_agent_source: source,
      receiver_agent_source_value: rawValue,
    });
    agents.linkedOverrides.set(
      opts.rowKey,
      result.receiver_agent_name_snapshot ?? agent.name,
    );
    agents.dialogs.delete(opts.rowKey);
    agents.changeRequested.delete(opts.rowKey);
    agents.closedRowKeys.delete(opts.rowKey);
    setStatus(app.dom, `Linked sales rep "${agent.name}".`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(app.dom, `Could not link sales rep: ${message}`, { tone: "error" });
    const dialog = agents.dialogs.get(opts.rowKey);
    if (dialog) {
      dialog.error = message;
    }
  } finally {
    agents.busyRowKeys.delete(opts.rowKey);
    opts.rerender();
  }
}

async function createAndLinkAgent(
  app: AppContext,
  opts: SalesRepControlOptions,
  dialogState: SalesRepDialogState,
): Promise<void> {
  const agents = app.state.agents;
  const name = dialogState.name.trim();
  if (!name) {
    dialogState.error = "Agent name is required.";
    opts.rerender();
    return;
  }

  agents.busyRowKeys.add(opts.rowKey);
  dialogState.error = undefined;
  opts.rerender();

  try {
    const agent = await createAgent({
      name,
      role: dialogState.role.trim() || "agent",
      active: dialogState.active,
      created_from: "extension_sales_rep_match",
    });
    // Make the new agent immediately matchable elsewhere without a full reload.
    agents.items.push(agent);

    const result = await linkReceiverAgent(opts.leadKind, opts.leadId!, {
      receiver_agent: agent._id,
      receiver_agent_source: "extension_created",
      receiver_agent_source_value: opts.rawValue,
    });
    agents.linkedOverrides.set(
      opts.rowKey,
      result.receiver_agent_name_snapshot ?? agent.name,
    );
    agents.dialogs.delete(opts.rowKey);
    agents.changeRequested.delete(opts.rowKey);
    agents.closedRowKeys.delete(opts.rowKey);
    setStatus(app.dom, `Created and linked sales rep "${agent.name}".`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(app.dom, `Could not create/link sales rep: ${message}`, {
      tone: "error",
    });
    dialogState.error = message;
  } finally {
    agents.busyRowKeys.delete(opts.rowKey);
    opts.rerender();
  }
}
