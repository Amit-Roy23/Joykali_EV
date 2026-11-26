import { handle } from "@/lib/route";
import { transferRegister } from "@/services/paymentRequestService";

/** Bank ↔ bank, bank → cash and cash → bank movements. ?from= &to= &direction= */
export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return transferRegister({ from: p.get("from") || undefined, to: p.get("to") || undefined, direction: p.get("direction") || undefined });
}, "accounts.view");
