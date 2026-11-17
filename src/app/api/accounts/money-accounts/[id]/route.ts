import { handle } from "@/lib/route";
import { saveMoneyAccount } from "@/services/accountsService";

export const PATCH = handle(async ({ req, user, params }) => saveMoneyAccount(user, { ...(await req.json()), id: params.id }), "accounts.manage");
