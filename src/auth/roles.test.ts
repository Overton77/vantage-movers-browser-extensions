import { describe, expect, it } from "vitest";

import {
  formatExtensionRoleLabels,
  hasExtensionRole,
  normalizeExtensionRoles,
  resolveStoredExtensionRoles,
  toPublicExtensionUser,
} from "./roles";

describe("resolveStoredExtensionRoles", () => {
  it("normalizes a non-empty roles array to unique current roles in canonical order", () => {
    expect(
      resolveStoredExtensionRoles({
        roles: ["customer_service", "sales", "sales", "owner"],
      }),
    ).toEqual(["owner", "sales", "customer_service"]);
  });

  it("maps leftover role employee to Sales and Customer Service", () => {
    expect(resolveStoredExtensionRoles({ role: "employee" })).toEqual([
      "sales",
      "customer_service",
    ]);
  });

  it("maps leftover current role to a single-item array", () => {
    expect(resolveStoredExtensionRoles({ role: "owner" })).toEqual(["owner"]);
    expect(resolveStoredExtensionRoles({ role: "sales" })).toEqual(["sales"]);
    expect(resolveStoredExtensionRoles({ role: "customer_service" })).toEqual([
      "customer_service",
    ]);
  });

  it("prefers roles over leftover role", () => {
    expect(
      resolveStoredExtensionRoles({
        roles: ["owner"],
        role: "employee",
      }),
    ).toEqual(["owner"]);
  });

  it("returns no roles when neither field is usable", () => {
    expect(resolveStoredExtensionRoles({})).toBeNull();
    expect(resolveStoredExtensionRoles({ roles: [] })).toBeNull();
    expect(resolveStoredExtensionRoles({ role: "contractor" })).toBeNull();
    expect(normalizeExtensionRoles(["employee"])).toBeNull();
  });
});

describe("hasExtensionRole", () => {
  it("treats Owner unions as Owner and Sales plus Customer Service as not Owner", () => {
    expect(hasExtensionRole(["owner"], "owner")).toBe(true);
    expect(hasExtensionRole(["owner", "sales"], "owner")).toBe(true);
    expect(hasExtensionRole(["sales", "customer_service"], "owner")).toBe(false);
  });
});

describe("formatExtensionRoleLabels", () => {
  it("joins Owner, Sales, Customer Service in canonical order", () => {
    expect(formatExtensionRoleLabels(["customer_service", "owner"])).toBe(
      "Owner, Customer Service",
    );
    expect(formatExtensionRoleLabels(["sales", "customer_service"])).toBe(
      "Sales, Customer Service",
    );
  });
});

describe("toPublicExtensionUser", () => {
  it("returns id, email, and resolved roles only", () => {
    expect(
      toPublicExtensionUser({
        id: "u1",
        email: "rep@example.invalid",
        role: "employee",
      }),
    ).toEqual({
      id: "u1",
      email: "rep@example.invalid",
      roles: ["sales", "customer_service"],
    });
  });
});
