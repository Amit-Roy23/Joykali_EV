import { userCan } from "@/lib/grants";
import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { MoneyAccount } from "@/models/Accounts";
import { Warehouse } from "@/models/Warehouse";
import { Outlet } from "@/models/Outlet";
import { accountBalances, accountsSettings, budgetHeads, ensureAccounts, voucherHeads } from "@/services/accountsService";

/** Lists for the expense / voucher forms. */
export const GET = handle(async ({ user }) => {
  const view = await userCan(user, "accounts.view");
  if (!view && !(await userCan(user, "expense.create"))) return errorResponse("Not allowed", 403);
  await ensureAccounts();
  const [cfg, heads, accounts, warehouses, outlets] = await Promise.all([
    accountsSettings(),
    voucherHeads(),
    MoneyAccount.find({ status: "ACTIVE" }).select("name kind isDefault openingDate").sort({ kind: 1, name: 1 }).lean(),
    Warehouse.find({ status: "ACTIVE" }).select("name").lean(),
    Outlet.find({ status: "ACTIVE" }).select("name").lean(),
  ]);
  const bal = view ? await accountBalances() : [];
  const balanceOf = (id: any) => (bal as any[]).find((b) => String(b._id) === String(id))?.balance;
  return {
    ...cfg,
    voucherHeads: heads,
    budgetHeads: await budgetHeads(),
    accounts: accounts.map((a: any) => ({ ...a, balance: view ? balanceOf(a._id) ?? 0 : undefined })),
    costCentres: ["Head office", ...warehouses.map((w: any) => w.name), ...outlets.map((o: any) => o.name)],
    canManage: await userCan(user, "accounts.manage"),
  };
});
