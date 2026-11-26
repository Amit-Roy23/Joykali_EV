import { userCan } from "@/lib/grants";
import { handle, fileFrom } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { Expense } from "@/models/Accounts";
import { createExpense, listExpenses } from "@/services/accountsService";

/** Accounts see every expense; others with expense.create see what they entered. */
export const GET = handle(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  if (await userCan(user, "accounts.view")) {
    return listExpenses({ status: sp.get("status") || undefined, from: sp.get("from") || undefined, to: sp.get("to") || undefined, category: sp.get("category") || undefined });
  }
  if (!(await userCan(user, "expense.create"))) return errorResponse("Not allowed", 403);
  return Expense.find({ createdBy: user.userId }).sort({ date: -1 }).limit(100).lean();
});

/** multipart: date, category, description, vendor, billNo, amount, gst, gstInput, costCentre, bill, payAccount, payDate, payReference */
export const POST = handle(async ({ req, user }) => {
  const f = await req.formData();
  const s = (k: string) => (f.get(k) as string | null) || "";
  return createExpense(user, {
    date: s("date"),
    category: s("category"),
    description: s("description"),
    vendor: s("vendor"),
    billNo: s("billNo"),
    amountRupees: Number(s("amount")),
    gstRupees: Number(s("gst") || 0),
    gstInput: s("gstInput") === "true",
    costCentre: s("costCentre"),
    bill: await fileFrom(f, "bill"),
    payNow: s("payAccount") ? { accountId: s("payAccount"), date: s("payDate") || undefined, reference: s("payReference") } : null,
  });
}, "expense.create");
