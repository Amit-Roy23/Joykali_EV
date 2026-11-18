import { handle } from "@/lib/route";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { partyScope } from "@/lib/partyAccess";

/** Dealers and distributors that pay the company directly (for the receipt form). */
export const GET = handle(async ({ user }) => {
  const scope = await partyScope(user);
  const [dealers, dists] = await Promise.all([
    Dealer.find({ parentDistributor: null, parentDealer: null, ...(scope ? { _id: { $in: scope.DEALER } } : {}) }).select("name city").sort({ name: 1 }).lean(),
    Distributor.find({ parent: null, ...(scope ? { _id: { $in: scope.DISTRIBUTOR } } : {}) }).select("name city").sort({ name: 1 }).lean(),
  ]);
  return [
    ...dists.map((d: any) => ({ type: "DISTRIBUTOR", id: String(d._id), name: `${d.name}, ${d.city}` })),
    ...dealers.map((d: any) => ({ type: "DEALER", id: String(d._id), name: `${d.name}, ${d.city}` })),
  ];
}, "ledger.manage");
