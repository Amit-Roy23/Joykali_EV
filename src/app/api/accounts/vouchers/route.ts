import { handle } from "@/lib/route";
import { createVoucher, listVouchers } from "@/services/accountsService";
import { createRequest } from "@/services/paymentRequestService";

export const GET = handle(async ({ req }) => listVouchers({ from: req.nextUrl.searchParams.get("from") || undefined, to: req.nextUrl.searchParams.get("to") || undefined }), "accounts.view");

/**
 * Receipts (money in) post straight away. Payments and contra transfers (money out / between
 * accounts) need approval first, so they become a payment request — the cashier pays once approved.
 */
export const POST = handle(async ({ req, user }) => {
  const b = await req.json();
  if (b.type === "PAYMENT" || b.type === "CONTRA") {
    const r = await createRequest(user, {
      type: b.type === "CONTRA" ? "TRANSFER" : "PAYMENT",
      amountRupees: Number(b.amountRupees),
      purpose: b.narration,
      head: b.head,
      payee: b.reference,
      accountId: b.accountId,
      toAccountId: b.toAccountId,
      neededBy: b.date,
    });
    return { request: r, routedForApproval: true };
  }
  return createVoucher(user, b);
}, "accounts.manage");
