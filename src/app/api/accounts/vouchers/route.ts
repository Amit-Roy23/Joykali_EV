import { handle } from "@/lib/route";
import { createVoucher, listVouchers } from "@/services/accountsService";

export const GET = handle(async ({ req }) => listVouchers({ from: req.nextUrl.searchParams.get("from") || undefined, to: req.nextUrl.searchParams.get("to") || undefined }), "accounts.view");
export const POST = handle(async ({ req, user }) => createVoucher(user, await req.json()), "accounts.manage");
