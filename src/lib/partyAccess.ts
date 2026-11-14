import mongoose from "mongoose";
import { JWTPayload, isPartnerRole, partyTypeOfRole } from "@/types";
import { User } from "@/models/User";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";

export type PartyType = "DEALER" | "DISTRIBUTOR";

/** The distributor a SUPER_DISTRIBUTOR / DISTRIBUTOR login acts for (null for everyone else). */
export async function distributorOf(user: JWTPayload): Promise<mongoose.Types.ObjectId | null> {
  if (partyTypeOfRole(user.role) !== "DISTRIBUTOR") return null;
  const u = await User.findById(user.userId).select("distributor status").lean();
  if (!u || u.status !== "ACTIVE") return null;
  return (u.distributor as mongoose.Types.ObjectId) || null;
}

/** The party (distributor or dealer record) a partner login acts for. */
export async function myParty(
  user: JWTPayload
): Promise<{ type: PartyType; id: mongoose.Types.ObjectId } | null> {
  const type = partyTypeOfRole(user.role);
  if (!type) return null;
  const u: any = await User.findById(user.userId).select("distributor dealer status").lean();
  if (!u || u.status !== "ACTIVE") return null;
  const id = type === "DISTRIBUTOR" ? u.distributor : u.dealer;
  return id ? { type, id } : null;
}

/** All parties below a partner: distributors under a super distributor, dealers, sub dealers. */
export async function downline(
  type: PartyType,
  id: mongoose.Types.ObjectId | string
): Promise<{ DEALER: mongoose.Types.ObjectId[]; DISTRIBUTOR: mongoose.Types.ObjectId[] }> {
  const oid = new mongoose.Types.ObjectId(String(id));
  const out = { DEALER: [] as mongoose.Types.ObjectId[], DISTRIBUTOR: [] as mongoose.Types.ObjectId[] };
  let distributors: mongoose.Types.ObjectId[] = [];
  let dealers: mongoose.Types.ObjectId[] = [];
  if (type === "DISTRIBUTOR") {
    distributors = (await Distributor.find({ parent: oid }).select("_id").lean()).map((d: any) => d._id);
    out.DISTRIBUTOR = distributors;
    dealers = (await Dealer.find({ parentDistributor: { $in: [oid, ...distributors] } }).select("_id").lean()).map((d: any) => d._id);
  } else {
    dealers = [];
  }
  const parentDealers = type === "DEALER" ? [oid, ...dealers] : dealers;
  const subs = parentDealers.length
    ? (await Dealer.find({ parentDealer: { $in: parentDealers } }).select("_id").lean()).map((d: any) => d._id)
    : [];
  const seen = new Set<string>();
  out.DEALER = [...dealers, ...subs].filter((d) => (seen.has(String(d)) ? false : (seen.add(String(d)), true)));
  return out;
}

/**
 * Which dealers/distributors a user may see and act for:
 *  - Admin, Managing Partner, Business Head: all
 *  - ASM: dealers and distributors assigned to them
 *  - Partner logins: only their own record (their downline is reached through the network APIs)
 *  - FEC: none
 * Returns `null` for "all", otherwise the allowed ids per party type.
 */
export async function partyScope(
  user: JWTPayload
): Promise<null | { DEALER: mongoose.Types.ObjectId[]; DISTRIBUTOR: mongoose.Types.ObjectId[] }> {
  if (["ADMIN", "MANAGING_PARTNER", "BUSINESS_HEAD"].includes(user.role)) return null;
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    return { DEALER: me?.type === "DEALER" ? [me.id] : [], DISTRIBUTOR: me?.type === "DISTRIBUTOR" ? [me.id] : [] };
  }
  if (user.role === "ASM") {
    const uid = new mongoose.Types.ObjectId(user.userId);
    const [dealers, distributors] = await Promise.all([
      Dealer.find({ assignedASM: uid }).select("_id").lean(),
      Distributor.find({ assignedASM: uid }).select("_id").lean(),
    ]);
    return {
      DEALER: dealers.map((d: any) => d._id),
      DISTRIBUTOR: distributors.map((d: any) => d._id),
    };
  }
  return { DEALER: [], DISTRIBUTOR: [] };
}

export async function canAccessParty(user: JWTPayload, partyType: PartyType, partyId: string | mongoose.Types.ObjectId) {
  const scope = await partyScope(user);
  if (scope === null) return true;
  return scope[partyType].some((id) => String(id) === String(partyId));
}

/** Mongo filter on {partyType, party} fields for documents like orders, DOs and ledger entries. */
export async function partyFilter(user: JWTPayload): Promise<Record<string, any>> {
  const scope = await partyScope(user);
  if (scope === null) return {};
  const or: Record<string, any>[] = [];
  if (scope.DEALER.length) or.push({ partyType: "DEALER", party: { $in: scope.DEALER } });
  if (scope.DISTRIBUTOR.length) or.push({ partyType: "DISTRIBUTOR", party: { $in: scope.DISTRIBUTOR } });
  return or.length ? { $or: or } : { _id: null };
}
