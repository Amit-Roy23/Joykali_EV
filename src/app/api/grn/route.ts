import { handle } from "@/lib/route";
import { grnRegister } from "@/services/grnService";

/** Goods receipts the user may see. ?from=&to= (dispatch date) */
export const GET = handle(async ({ req, user }) =>
  grnRegister(user, { from: req.nextUrl.searchParams.get("from") || undefined, to: req.nextUrl.searchParams.get("to") || undefined })
);
