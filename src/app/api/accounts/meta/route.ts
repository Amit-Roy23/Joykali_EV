import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { MoneyAccount } from "@/models/Accounts";
import { Warehouse } from "@/models/Warehouse";
import { Outlet } from "@/models/Outlet";
import { accountsSettings, budgetHeads, ensureAccounts, voucherHeads } from "@/services/accountsService";

/** Lists for the expense / voucher forms. */
export const GET = handle(async ({ user }) => {
  const view = await hasPermission(user.role, "accounts.view");
  if (!view && !(await hasPermission(user.role, "expense.create"))) return errorResponse("Not allowed", 403);
  await ensureAccounts();
  const [cfg, heads, accounts, warehouses, outlets] = await Promise.all([
    accountsSettings(),
    voucherHeads(),
    MoneyAccount.find({ status: "ACTIVE" }).select("name kind isDefault openingDate").sort({ kind: 1, name: 1 }).lean(),
    Warehouse.find({ status: "ACTIVE" }).select("name").lean(),
    Outlet.find({ status: "ACTIVE" }).select("name").lean(),
  ]);
  return {
    ...cfg,
    voucherHeads: heads,
    budgetHeads: await budgetHeads(),
    accounts,
    costCentres: ["Head office", ...warehouses.map((w: any) => w.name), ...outlets.map((o: any) => o.name)],
    canManage: await hasPermission(user.role, "accounts.manage"),
  };
});
