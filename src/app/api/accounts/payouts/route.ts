import { handle } from "@/lib/route";
import { pendingPayouts, recordPayout } from "@/services/accountsService";

export const GET = handle(async () => pendingPayouts(), "accounts.view");
/** { kind, id, accountId, date, reference, amountRupees? } */
export const POST = handle(async ({ req, user }) => {
  const b = await req.json();
  return recordPayout(user, b.kind, b.id, b);
}, "accounts.manage");
