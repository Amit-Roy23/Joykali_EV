import mongoose from "mongoose";
import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { VehicleModel } from "@/models/VehicleModel";
import { Item } from "@/models/Item";

const RATE_FIELDS = ["purchasePrice", "sellingPrice", "dealerPrice", "distributorPrice", "superDistributorPrice", "subDealerPrice", "gstRate", "hsnCode"] as const;

export const GET = handle(async ({ params }) => {
  if (!mongoose.isValidObjectId(params.id)) return errorResponse("Model not found", 404);
  const m = await VehicleModel.findById(params.id).populate("batteryItem", "name code").lean();
  if (!m) return errorResponse("Model not found", 404);
  return m;
}, "inventory.view");

/**
 * Edit a vehicle model. Details need inventory.manage; any rate change (ex-showroom, purchase,
 * channel prices, GST, HSN) needs price.manage and is kept in the rate history. New rates apply to
 * new sales, orders and purchases — invoices already made keep their own prices.
 */
export const PUT = handle(async ({ req, user, params }) => {
  const [canEdit, canPrice] = await Promise.all([hasPermission(user.role, "inventory.manage"), hasPermission(user.role, "price.manage")]);
  if (!canEdit && !canPrice) return errorResponse("Not allowed", 403);
  if (!mongoose.isValidObjectId(params.id)) return errorResponse("Model not found", 404);
  const m: any = await VehicleModel.findById(params.id);
  if (!m) return errorResponse("Model not found", 404);
  const b = await req.json();

  const money = (v: any) => (v === "" || v === null || v === undefined ? null : rupeesToPaise(Number(v)));
  const next: Record<string, any> = {
    purchasePrice: money(b.purchaseRupees) ?? m.purchasePrice,
    sellingPrice: money(b.sellingRupees) ?? m.sellingPrice,
    dealerPrice: b.dealerRupees !== undefined ? money(b.dealerRupees) : m.dealerPrice ?? null,
    distributorPrice: b.distributorRupees !== undefined ? money(b.distributorRupees) : m.distributorPrice ?? null,
    superDistributorPrice: b.superDistributorRupees !== undefined ? money(b.superDistributorRupees) : m.superDistributorPrice ?? null,
    subDealerPrice: b.subDealerRupees !== undefined ? money(b.subDealerRupees) : m.subDealerPrice ?? null,
    gstRate: b.gstRate !== undefined ? Number(b.gstRate) : m.gstRate,
    hsnCode: b.hsnCode !== undefined ? String(b.hsnCode).trim() : m.hsnCode,
  };
  for (const f of RATE_FIELDS) {
    if (f === "hsnCode") continue;
    const v = next[f];
    if (v !== null && (!Number.isFinite(v) || v < 0)) return errorResponse("Rates must be zero or more", 400);
  }
  if (!(next.sellingPrice > 0)) return errorResponse("Ex-showroom price must be more than zero", 400);
  if (![0, 5, 12, 18, 28].includes(next.gstRate)) return errorResponse("GST rate must be 0, 5, 12, 18 or 28%", 400);
  if (!/^\d{4,8}$/.test(next.hsnCode)) return errorResponse("HSN code must be 4 to 8 digits", 400);
  for (const [f, label] of [["superDistributorPrice", "Super distributor"], ["distributorPrice", "Distributor"], ["dealerPrice", "Dealer"], ["subDealerPrice", "Sub-dealer"]] as const) {
    if (next[f] && next[f] > next.sellingPrice) return errorResponse(`${label} price cannot be above the ex-showroom price`, 400);
  }

  const changes = RATE_FIELDS.filter((f) => String(m[f] ?? "") !== String(next[f] ?? "")).map((f) => ({ field: f, from: m[f] ?? null, to: next[f] }));
  if (changes.length && !canPrice) return errorResponse("You can edit the model but not its prices", 403);

  if (canEdit) {
    if (b.variant !== undefined && String(b.variant).trim()) m.variant = String(b.variant).trim();
    if (b.batteryType !== undefined && String(b.batteryType).trim()) m.batteryType = String(b.batteryType).trim();
    if (b.rangeKm !== undefined && Number(b.rangeKm) > 0) m.rangeKm = Number(b.rangeKm);
    if (b.isActive !== undefined) m.isActive = !!b.isActive;
    if (b.batteryItem !== undefined) {
      if (b.batteryItem && !(await Item.exists({ _id: b.batteryItem, category: "BATTERY" }))) return errorResponse("Choose a battery item", 400);
      m.batteryItem = b.batteryItem || null;
    }
  }
  Object.assign(m, next);
  if (changes.length) m.rateHistory.push({ at: new Date(), by: new mongoose.Types.ObjectId(user.userId), byName: user.name, changes, note: String(b.rateNote || "").trim() || undefined });
  m.updatedBy = new mongoose.Types.ObjectId(user.userId);
  await m.save();
  await logAudit({ user, action: "UPDATE", resource: changes.length ? "PRICE" : "VEHICLE", resourceId: params.id, after: { model: `${m.name} ${m.variant}`, changes } });
  return m;
});
