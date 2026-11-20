import mongoose from "mongoose";
import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { ItemSerial } from "@/models/Item";

/** Serial numbers in stock for an item (optionally one warehouse / condition) — for pickers. */
export const GET = handle(async ({ req, user }) => {
  const ok = (await hasPermission(user.role, "inventory.view")) || (await hasPermission(user.role, "sales.create")) || (await hasPermission(user.role, "parts.sell"));
  if (!ok) return errorResponse("Not allowed", 403);
  const p = req.nextUrl.searchParams;
  const item = p.get("item");
  if (!item || !mongoose.isValidObjectId(item)) return errorResponse("Choose the item", 400);
  const f: any = { item: new mongoose.Types.ObjectId(item), status: "IN_STOCK", condition: p.get("condition") || "GOOD" };
  const wh = p.get("warehouse");
  if (wh && mongoose.isValidObjectId(wh)) f.warehouse = new mongoose.Types.ObjectId(wh);
  return ItemSerial.find(f).select("serialNo warehouse condition source").sort({ serialNo: 1 }).limit(500).lean();
});
