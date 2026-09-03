import type { WorkspaceId } from "../app/state";
import type { AuthSession, ExtensionRole } from "./types";

const OWNER_WORKSPACES: readonly WorkspaceId[] = [
  "form-leads",
  "form-edit-lead",
  "call-leads",
  "search",
  "csv",
  "automation",
  "diagnose",
  "debug",
  "binding-estimate-fee",
  "tariff-adjustment",
];

const SALES_WORKSPACES: readonly WorkspaceId[] = ["binding-estimate-fee"];

const CUSTOMER_SERVICE_WORKSPACES: readonly WorkspaceId[] = [
  "tariff-adjustment",
];

const EMPLOYEE_WORKSPACES: readonly WorkspaceId[] = [
  "binding-estimate-fee",
  "tariff-adjustment",
];

const ROLE_WORKSPACES: Record<ExtensionRole, readonly WorkspaceId[]> = {
  owner: OWNER_WORKSPACES,
  sales: SALES_WORKSPACES,
  customer_service: CUSTOMER_SERVICE_WORKSPACES,
  employee: EMPLOYEE_WORKSPACES,
};

const ROLE_DEFAULT_WORKSPACE: Record<ExtensionRole, WorkspaceId> = {
  owner: "form-leads",
  sales: "binding-estimate-fee",
  customer_service: "tariff-adjustment",
  employee: "binding-estimate-fee",
};

export function getAllowedWorkspaces(role: ExtensionRole): readonly WorkspaceId[] {
  return ROLE_WORKSPACES[role] ?? [];
}

export function canAccessWorkspace(
  session: AuthSession | undefined,
  workspace: WorkspaceId,
): boolean {
  if (!session) {
    return false;
  }
  return getAllowedWorkspaces(session.user.role).includes(workspace);
}

export function defaultWorkspaceForSession(
  session: AuthSession | undefined,
): WorkspaceId {
  const role = session?.user.role;
  if (!role) {
    return "form-leads";
  }
  return ROLE_DEFAULT_WORKSPACE[role] ?? "form-leads";
}
