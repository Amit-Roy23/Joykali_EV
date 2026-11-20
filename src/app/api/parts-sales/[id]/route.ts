import mongoose from "mongoose";
import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { PartsSale } from "@/models/Item";
import { cancelPartsSale, recordPartsPayment } from "@/services/itemService";

export const GET = handle(async ({ params }) => {
  if (!mongoose.isValidObjectId(params.id)) return errorResponse("Sale not found", 404);
  const s = await PartsSale.findById(params.id).populate("lines.warehouse", "name code").lean();
  if (!s) return errorResponse("Sale not found", 404);
  return s;
}, "parts.sell");

/** { action: "cancel", reason } | { action: "payment", amountRupees, mode, reference, date } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "cancel") return cancelPartsSale(user, params.id, b.reason);
  if (b.action === "payment") return recordPartsPayment(user, params.id, b);
  return errorResponse("Unknown action", 400);
}, "parts.sell");
