import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { supplierRef, tierOf, tierPrice, channelPrice } from "../creditService";
import { appointableTiers, commissionEarned, depositHeld } from "../networkService";
import { kycStatus } from "../partnerAdminService";
import { isPartnerRole, partyTypeOfRole } from "@/types";

const id = () => new mongoose.Types.ObjectId();

describe("channel tiers and suppliers", () => {
  it("works out who supplies each partner", () => {
    const sd = id();
    const dist = id();
    const dealer = id();
    expect(supplierRef("DISTRIBUTOR", { tier: "SUPER_DISTRIBUTOR", parent: null })).toBeNull();
    expect(supplierRef("DISTRIBUTOR", { tier: "DISTRIBUTOR", parent: null })).toBeNull();
    expect(supplierRef("DISTRIBUTOR", { tier: "DISTRIBUTOR", parent: sd })).toEqual({ type: "DISTRIBUTOR", id: sd });
    // company dealer (consignment)
    expect(supplierRef("DEALER", { tier: "DEALER" })).toBeNull();
    expect(supplierRef("DEALER", { tier: "DEALER", parentDistributor: dist })).toEqual({ type: "DISTRIBUTOR", id: dist });
    // sub dealer: its dealer first, else its distributor
    expect(supplierRef("DEALER", { tier: "SUB_DEALER", parentDealer: dealer, parentDistributor: dist })).toEqual({ type: "DEALER", id: dealer });
    expect(supplierRef("DEALER", { tier: "SUB_DEALER", parentDistributor: dist })).toEqual({ type: "DISTRIBUTOR", id: dist });
  });

  it("only lets a partner appoint the next level down, and never from consignment stock", () => {
    expect(appointableTiers("SUPER_DISTRIBUTOR")).toEqual(["DISTRIBUTOR"]);
    expect(appointableTiers("DISTRIBUTOR")).toEqual(["DEALER", "SUB_DEALER"]);
    expect(appointableTiers("DEALER", { parentDistributor: id() })).toEqual(["SUB_DEALER"]);
    expect(appointableTiers("DEALER", {})).toEqual([]); // company dealer holds company stock
    expect(appointableTiers("SUB_DEALER")).toEqual([]);
  });

  it("prices each tier, with margins off MRP when no explicit price is set", () => {
    const m = { sellingPrice: 10000000 }; // ₹1,00,000
    expect(tierPrice(m, "SUPER_DISTRIBUTOR")).toBe(8500000);
    expect(tierPrice(m, "DISTRIBUTOR")).toBe(8800000);
    expect(tierPrice(m, "DEALER")).toBe(9200000);
    expect(tierPrice(m, "SUB_DEALER")).toBe(9500000);
    expect(tierPrice({ ...m, subDealerPrice: 9300000 }, "SUB_DEALER")).toBe(9300000);
    // the price ladder never inverts
    const ladder = (["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"] as const).map((t) => tierPrice(m, t));
    expect([...ladder].sort((a, b) => a - b)).toEqual(ladder);
    // legacy callers: party type only
    expect(channelPrice(m, "DISTRIBUTOR")).toBe(8800000);
    expect(channelPrice(m, "DISTRIBUTOR", tierOf("DISTRIBUTOR", { tier: "SUPER_DISTRIBUTOR" }))).toBe(8500000);
    expect(tierOf("DEALER", null)).toBe("DEALER");
  });

  it("maps partner roles to their records", () => {
    expect(isPartnerRole("SUB_DEALER")).toBe(true);
    expect(isPartnerRole("OUTLET")).toBe(false);
    expect(isPartnerRole("ADMIN")).toBe(false);
    expect(partyTypeOfRole("SUPER_DISTRIBUTOR")).toBe("DISTRIBUTOR");
    expect(partyTypeOfRole("SUB_DEALER")).toBe("DEALER");
    expect(partyTypeOfRole("FEC")).toBeNull();
  });
});

describe("targets, deposits and KYC", () => {
  it("pays commission on every unit, but only once the unit target is reached", () => {
    const t = { targetUnits: 10, commissionPerUnit: 150000 };
    expect(commissionEarned(t, 9)).toBe(0);
    expect(commissionEarned(t, 10)).toBe(1500000);
    expect(commissionEarned(t, 13)).toBe(1950000);
    expect(commissionEarned({ targetUnits: 0, commissionPerUnit: 100 }, 5)).toBe(0);
  });

  it("tracks the deposit held", () => {
    expect(depositHeld([])).toBe(0);
    expect(
      depositHeld([
        { type: "RECEIVED", amount: 20000000 },
        { type: "ADJUSTED", amount: 5000000 },
        { type: "REFUNDED", amount: 1000000 },
      ])
    ).toBe(14000000);
  });

  it("needs GST, PAN and agreement verified and unexpired", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    const docs = [
      { docType: "GST", status: "VERIFIED" },
      { docType: "PAN", status: "VERIFIED" },
      { docType: "AGREEMENT", status: "PENDING" },
    ];
    expect(kycStatus(docs, now)).toEqual({ complete: false, missing: ["AGREEMENT"], pending: 1 });
    const ok = [...docs.slice(0, 2), { docType: "AGREEMENT", status: "VERIFIED", validTill: new Date("2027-03-31") }];
    expect(kycStatus(ok, now).complete).toBe(true);
    const lapsed = [...docs.slice(0, 2), { docType: "AGREEMENT", status: "VERIFIED", validTill: new Date("2026-10-31") }];
    expect(kycStatus(lapsed, now).missing).toEqual(["AGREEMENT"]);
  });
});
