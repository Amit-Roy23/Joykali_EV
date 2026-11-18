import { handle } from "@/lib/route";
import { bankReconciliation } from "@/services/paymentService";

export const GET = handle(async ({ req }) => bankReconciliation(req.nextUrl.searchParams.get("account") || "", req.nextUrl.searchParams.get("asOf") || undefined), "accounts.view");
