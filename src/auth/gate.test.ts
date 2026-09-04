import { describe, expect, it } from "vitest";

import {
  canAccessWorkspace,
  defaultWorkspaceForSession,
  getAllowedWorkspaces,
} from "./gate";
import type { AuthSession, ExtensionRole } from "./types";

const OWNER_WORKSPACES = [
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
] as const;

describe("getAllowedWorkspaces", () => {
  it("unions leftover Employee's two workspaces for Sales plus Customer Service", () => {
    expect(getAllowedWorkspaces(["sales", "customer_service"])).toEqual([
      "binding-estimate-fee",
      "tariff-adjustment",
    ]);
  });

  it("short-circuits Owner unions to the full Owner list", () => {
    expect(getAllowedWorkspaces(["owner"])).toEqual([...OWNER_WORKSPACES]);
    expect(getAllowedWorkspaces(["owner", "sales"])).toEqual([
      ...OWNER_WORKSPACES,
    ]);
    expect(getAllowedWorkspaces(["owner", "customer_service"])).toEqual([
      ...OWNER_WORKSPACES,
    ]);
  });

  it("keeps Sales-only and Customer Service-only lists narrow", () => {
    expect(getAllowedWorkspaces(["sales"])).toEqual(["binding-estimate-fee"]);
    expect(getAllowedWorkspaces(["customer_service"])).toEqual([
      "tariff-adjustment",
    ]);
  });
});

describe("defaultWorkspaceForSession", () => {
  it("follows spec §3.2", () => {
    expect(defaultWorkspaceForSession(session(["owner"]))).toBe("form-leads");
    expect(defaultWorkspaceForSession(session(["owner", "sales"]))).toBe(
      "form-leads",
    );
    expect(defaultWorkspaceForSession(session(["sales"]))).toBe(
      "binding-estimate-fee",
    );
    expect(
      defaultWorkspaceForSession(session(["sales", "customer_service"])),
    ).toBe("binding-estimate-fee");
    expect(defaultWorkspaceForSession(session(["customer_service"]))).toBe(
      "tariff-adjustment",
    );
    expect(defaultWorkspaceForSession(undefined)).toBe("form-leads");
  });
});

describe("canAccessWorkspace", () => {
  it("does not treat Sales plus Customer Service as Owner", () => {
    const dual = session(["sales", "customer_service"]);
    expect(canAccessWorkspace(dual, "binding-estimate-fee")).toBe(true);
    expect(canAccessWorkspace(dual, "tariff-adjustment")).toBe(true);
    expect(canAccessWorkspace(dual, "form-leads")).toBe(false);
    expect(canAccessWorkspace(dual, "automation")).toBe(false);
  });
});

function session(roles: ExtensionRole[]): AuthSession {
  return {
    user: {
      id: `${roles.join("+")}-1`,
      email: `${roles[0]}@example.invalid`,
      roles,
    },
    accessToken: "access",
    refreshToken: "refresh",
  };
}
