import { handle } from "@/lib/route";
import { accountsOverview } from "@/services/accountsService";

export const GET = handle(async () => accountsOverview(), "accounts.view");
