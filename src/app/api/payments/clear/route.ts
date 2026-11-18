import { handle } from "@/lib/route";
import { setCleared } from "@/services/paymentService";

/** { ids: string[], statementDate: "YYYY-MM-DD" | null } */
export const POST = handle(async ({ req, user }) => {
  const b = await req.json();
  return setCleared(user, b.ids, b.statementDate ?? null);
});
