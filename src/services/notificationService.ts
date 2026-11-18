import mongoose from "mongoose";
import { Notification } from "@/models/Notification";
import { User } from "@/models/User";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";

export interface Notice {
  kind: string;
  title: string;
  body?: string;
  href?: string;
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));

/** Notify specific logins (skips the person who caused it). Never throws: a notice must not break the business action. */
export async function notifyUsers(userIds: any[], n: Notice, exceptUserId?: string) {
  try {
    const ids = [...new Set(userIds.filter(Boolean).map(String))].filter((id) => id !== exceptUserId);
    if (!ids.length) return;
    await Notification.insertMany(ids.map((id) => ({ user: oid(id), ...n, read: false })));
  } catch (e) {
    console.error("notify failed", e);
  }
}

/** Every active login of a dealer / distributor. */
export async function partyUserIds(partyType: "DEALER" | "DISTRIBUTOR", partyId: any) {
  const field = partyType === "DEALER" ? "dealer" : "distributor";
  const users = await User.find({ [field]: oid(partyId), status: "ACTIVE", role: { $in: ["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"] } }).select("_id").lean();
  return users.map((u: any) => String(u._id));
}

export async function notifyParty(partyType: "DEALER" | "DISTRIBUTOR", partyId: any, n: Notice, exceptUserId?: string) {
  await notifyUsers(await partyUserIds(partyType, partyId), n, exceptUserId);
}

/** Staff who look after a party: its ASM and the Business Head(s). */
export async function partyStaffIds(partyType: "DEALER" | "DISTRIBUTOR", partyId: any) {
  const Coll: any = partyType === "DEALER" ? Dealer : Distributor;
  const [p, bhs] = await Promise.all([Coll.findById(partyId).select("assignedASM").lean(), User.find({ role: "BUSINESS_HEAD", status: "ACTIVE" }).select("_id").lean()]);
  return [p?.assignedASM, ...bhs.map((u: any) => u._id)].filter(Boolean).map(String);
}

export async function notifyRoles(roles: string[], n: Notice, exceptUserId?: string) {
  const users = await User.find({ role: { $in: roles }, status: "ACTIVE" }).select("_id").lean();
  await notifyUsers(users.map((u: any) => u._id), n, exceptUserId);
}

export async function myNotifications(userId: string) {
  const [list, unread] = await Promise.all([
    Notification.find({ user: oid(userId) }).sort({ createdAt: -1 }).limit(40).lean(),
    Notification.countDocuments({ user: oid(userId), read: false }),
  ]);
  return { list, unread };
}

export async function markRead(userId: string, ids?: string[]) {
  const f: any = { user: oid(userId), read: false };
  if (ids?.length) f._id = { $in: ids.filter((i) => mongoose.isValidObjectId(i)).map(oid) };
  await Notification.updateMany(f, { $set: { read: true } });
  return myNotifications(userId);
}
