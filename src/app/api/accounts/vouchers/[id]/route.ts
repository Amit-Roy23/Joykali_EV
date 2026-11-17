import { handle } from "@/lib/route";
import { cancelVoucher } from "@/services/accountsService";

export const POST = handle(async ({ req, user, params }) => cancelVoucher(user, params.id, (await req.json()).reason), "accounts.manage");
