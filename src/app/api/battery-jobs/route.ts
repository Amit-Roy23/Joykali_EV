import { handle } from "@/lib/route";
import { listBatteryJobs, receiveBattery } from "@/services/itemService";

export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return listBatteryJobs({ status: p.get("status") || undefined, q: p.get("q") || undefined });
}, "parts.sell");

/** Receive a customer's battery for repair (optionally replace straight away with `replaceNow`). */
export const POST = handle(async ({ req, user }) => receiveBattery(user, await req.json()), "parts.sell");
