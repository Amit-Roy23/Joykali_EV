import { handle } from "@/lib/route";
import { outstandingReport } from "@/services/accountsService";

export const GET = handle(async () => outstandingReport(), "accounts.view");
