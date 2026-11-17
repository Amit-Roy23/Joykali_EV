import { handle } from "@/lib/route";
import { accountBalances, saveMoneyAccount } from "@/services/accountsService";

export const GET = handle(async () => accountBalances(), "accounts.view");
export const POST = handle(async ({ req, user }) => saveMoneyAccount(user, await req.json()), "accounts.manage");
