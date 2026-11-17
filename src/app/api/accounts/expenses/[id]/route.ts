import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { cancelExpense } from "@/services/accountsService";

/** { action: "cancel", reason } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "cancel") return cancelExpense(user, params.id, b.reason);
  return errorResponse("Unknown action", 400);
}, "expense.create");
