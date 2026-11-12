import { describe, it, expect } from "vitest";
import { canManageRole, DEFAULT_ROLE_PERMISSIONS } from "../rbac";
import { UserRole } from "@/types";

describe("RBAC and Hierarchy Rules", () => {
  it("enforces that a manager cannot create or edit an equal or higher role", () => {
    // Admin can manage everyone
    expect(canManageRole("ADMIN", "MANAGING_PARTNER")).toBe(true);
    expect(canManageRole("ADMIN", "ADMIN")).toBe(true);

    // Managing Partner can manage BH, ASM, FEC, but NOT MP or Admin
    expect(canManageRole("MANAGING_PARTNER", "BUSINESS_HEAD")).toBe(true);
    expect(canManageRole("MANAGING_PARTNER", "MANAGING_PARTNER")).toBe(false);
    expect(canManageRole("MANAGING_PARTNER", "ADMIN")).toBe(false);

    // Business Head can manage ASM and FEC, but NOT BH or above
    expect(canManageRole("BUSINESS_HEAD", "ASM")).toBe(true);
    expect(canManageRole("BUSINESS_HEAD", "FEC")).toBe(true);
    expect(canManageRole("BUSINESS_HEAD", "BUSINESS_HEAD")).toBe(false);
    expect(canManageRole("BUSINESS_HEAD", "MANAGING_PARTNER")).toBe(false);

    // ASM can manage FEC, but NOT ASM or above
    expect(canManageRole("ASM", "FEC")).toBe(true);
    expect(canManageRole("ASM", "ASM")).toBe(false);

    // FEC cannot manage anyone
    expect(canManageRole("FEC", "FEC")).toBe(false);
    expect(canManageRole("FEC", "ASM")).toBe(false);
  });

  it("has proper default permission assignments", () => {
    // FEC should have sales.create and sales.view.own
    expect(DEFAULT_ROLE_PERMISSIONS.FEC).toContain("sales.create");
    expect(DEFAULT_ROLE_PERMISSIONS.FEC).toContain("sales.view.own");
    expect(DEFAULT_ROLE_PERMISSIONS.FEC).not.toContain("sales.view.all");

    // ASM should have team view
    expect(DEFAULT_ROLE_PERMISSIONS.ASM).toContain("sales.view.team");
    expect(DEFAULT_ROLE_PERMISSIONS.ASM).not.toContain("payroll.lock");

    // MP should have approve and lock permissions
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGING_PARTNER).toContain("payroll.lock");
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGING_PARTNER).toContain("scheme.approve");

    // Admin should have settings.manage and audit.view
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toContain("settings.manage");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toContain("audit.view");
  });
});

