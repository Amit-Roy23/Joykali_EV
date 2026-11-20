import { handle } from "@/lib/route";
import { createPartsSale, listPartsSales } from "@/services/itemService";

export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return listPartsSales({ from: p.get("from") || undefined, to: p.get("to") || undefined, q: p.get("q") || undefined, status: p.get("status") || undefined });
}, "parts.sell");

export const POST = handle(async ({ req, user }) => createPartsSale(user, await req.json()), "parts.sell");
