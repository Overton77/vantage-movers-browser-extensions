import type { ExtensionRole, ExtensionUser } from "./types";

export const CURRENT_EXTENSION_ROLES = [
  "owner",
  "sales",
  "customer_service",
] as const satisfies readonly ExtensionRole[];

const LEFTOVER_EMPLOYEE_ROLES: ExtensionRole[] = ["sales", "customer_service"];

const ROLE_LABELS: Record<ExtensionRole, string> = {
  owner: "Owner",
  sales: "Sales",
  customer_service: "Customer Service",
};

export function isCurrentExtensionRole(value: unknown): value is ExtensionRole {
  return (
    typeof value === "string" &&
    (CURRENT_EXTENSION_ROLES as readonly string[]).includes(value)
  );
}

export function normalizeExtensionRoles(input: unknown): ExtensionRole[] | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const unique = new Set<ExtensionRole>();
  for (const value of input) {
    if (!isCurrentExtensionRole(value)) {
      return null;
    }
    unique.add(value);
  }

  if (unique.size === 0) {
    return null;
  }

  return CURRENT_EXTENSION_ROLES.filter((role) => unique.has(role));
}

export function resolveStoredExtensionRoles(doc: {
  roles?: unknown;
  role?: unknown;
}): ExtensionRole[] | null {
  if (Array.isArray(doc.roles) && doc.roles.length > 0) {
    return normalizeExtensionRoles(doc.roles);
  }

  if (doc.role === "employee") {
    return [...LEFTOVER_EMPLOYEE_ROLES];
  }

  if (isCurrentExtensionRole(doc.role)) {
    return [doc.role];
  }

  return null;
}

export function hasExtensionRole(
  roles: readonly ExtensionRole[],
  role: ExtensionRole,
): boolean {
  return roles.includes(role);
}

export function formatExtensionRoleLabels(
  roles: readonly ExtensionRole[] | null | undefined,
): string {
  const held = roles ?? [];
  return CURRENT_EXTENSION_ROLES.filter((role) => held.includes(role))
    .map((role) => ROLE_LABELS[role])
    .join(", ");
}

export function toPublicExtensionUser(input: {
  id?: unknown;
  email?: unknown;
  roles?: unknown;
  role?: unknown;
}): ExtensionUser | null {
  if (typeof input.id !== "string" || typeof input.email !== "string") {
    return null;
  }
  const roles = resolveStoredExtensionRoles(input);
  if (!roles || roles.length === 0) {
    return null;
  }
  return { id: input.id, email: input.email, roles };
}
