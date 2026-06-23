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
];

const EMPLOYEE_WORKSPACES: readonly WorkspaceId[] = ["binding-estimate-fee"];

export function getAllowedWorkspaces(role: ExtensionRole): readonly WorkspaceId[] {
  return role === "employee" ? EMPLOYEE_WORKSPACES : OWNER_WORKSPACES;
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
  return session?.user.role === "employee" ? "binding-estimate-fee" : "form-leads";
}
