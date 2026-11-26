import { handle } from "@/lib/route";
import { createRequest, listRequests } from "@/services/paymentRequestService";

/** ?status=PENDING,APPROVED &type=PAYMENT|TRANSFER */
export const GET = handle(async ({ req, user }) => {
  const p = req.nextUrl.searchParams;
  return listRequests(user, { status: p.get("status") || undefined, type: p.get("type") || undefined });
});

/** { type: PAYMENT|TRANSFER, amountRupees, purpose, head, payee, accountId, toAccountId, preferredMode, neededBy } */
export const POST = handle(async ({ req, user }) => createRequest(user, await req.json()));
