import mongoose from "mongoose";
import { Purchase } from "@/models/Purchase";
import { VehicleModel } from "@/models/VehicleModel";

/**
 * Cost of each vehicle (paise, ex-GST): the unit cost on the purchase invoice it came in on,
 * else the model's standard purchase price. Used for stock valuation, transfer challans and
 * cost of goods sold in the profit and loss account.
 */
export async function vehicleCosts(vehicles: Array<{ _id: any; model: any; purchase?: any }>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!vehicles.length) return out;
  const modelId = (v: any) => String(v.model?._id ?? v.model);
  const purchaseIds = [...new Set(vehicles.map((v) => v.purchase).filter(Boolean).map(String))];
  const modelIds = [...new Set(vehicles.map(modelId))];
  const [purchases, models] = await Promise.all([
    purchaseIds.length
      ? Purchase.find({ _id: { $in: purchaseIds.map((p) => new mongoose.Types.ObjectId(p)) } }).select("lineItems").lean()
      : Promise.resolve([] as any[]),
    VehicleModel.find({ _id: { $in: modelIds.map((m) => new mongoose.Types.ObjectId(m)) } }).select("purchasePrice").lean(),
  ]);
  const lineCost = new Map<string, number>();
  for (const p of purchases as any[]) for (const l of p.lineItems || []) lineCost.set(`${p._id}:${l.model}`, l.unitCost);
  const std = new Map<string, number>(models.map((m: any) => [String(m._id), m.purchasePrice || 0]));
  for (const v of vehicles) {
    const fromInvoice = v.purchase ? lineCost.get(`${v.purchase}:${modelId(v)}`) : undefined;
    out.set(String(v._id), fromInvoice ?? std.get(modelId(v)) ?? 0);
  }
  return out;
}

/** Age bucket label for days in stock. */
export function ageBucket(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
