import type { WorkspaceId } from "../app/state";
import { hasExtensionRole } from "./roles";
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

export function getAllowedWorkspaces(
  roles: readonly ExtensionRole[],
): readonly WorkspaceId[] {
  if (hasExtensionRole(roles, "owner")) {
    return OWNER_WORKSPACES;
  }

  const allowed: WorkspaceId[] = [];
  if (hasExtensionRole(roles, "sales")) {
    allowed.push(...SALES_WORKSPACES);
  }
  if (hasExtensionRole(roles, "customer_service")) {
    allowed.push(...CUSTOMER_SERVICE_WORKSPACES);
  }
  return allowed;
}

export function canAccessWorkspace(
  session: AuthSession | undefined,
  workspace: WorkspaceId,
): boolean {
  if (!session) {
    return false;
  }
  return getAllowedWorkspaces(session.user.roles).includes(workspace);
}

export function defaultWorkspaceForSession(
  session: AuthSession | undefined,
): WorkspaceId {
  const roles = session?.user.roles;
  if (!roles || roles.length === 0) {
    return "form-leads";
  }
  if (hasExtensionRole(roles, "owner")) {
    return "form-leads";
  }
  if (hasExtensionRole(roles, "sales")) {
    return "binding-estimate-fee";
  }
  return "tariff-adjustment";
}
