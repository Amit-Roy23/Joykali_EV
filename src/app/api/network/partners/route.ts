import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import mongoose from "mongoose";
import { isPartnerRole } from "@/types";
import { myParty } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { appointableTiers, createPartner, directChildren, TIER_LABEL } from "@/services/networkService";
import { creditSummary, getParty, tierOf } from "@/services/creditService";
import { Vehicle } from "@/models/Vehicle";

/**
 * Direct buyers of a partner, with their credit position and stock.
 * Partners: their own downline. Staff (network.view): ?parentType=&parentId=
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    let parent: { type: "DEALER" | "DISTRIBUTOR"; id: any } | null = null;
    if (isPartnerRole(auth.user.role)) parent = await myParty(auth.user);
    else {
      if (!(await hasPermission(auth.user.role, "network.view"))) return errorResponse("Forbidden", 403);
      const sp = req.nextUrl.searchParams;
      const t = sp.get("parentType");
      const id = sp.get("parentId");
      if ((t === "DEALER" || t === "DISTRIBUTOR") && id && mongoose.isValidObjectId(id)) parent = { type: t, id };
    }
    if (!parent) return jsonResponse({ parent: null, children: [] });
    const pdoc = await getParty(parent.type, parent.id);
    const kids = await directChildren(parent.type, parent.id);
    const children = await Promise.all(
      kids.map(async (k) => ({
        partyType: k.type,
        _id: k.doc._id,
        name: k.doc.name,
        code: k.type === "DEALER" ? k.doc.dealerCode : k.doc.distributorCode,
        tier: tierOf(k.type, k.doc),
        tierLabel: TIER_LABEL[tierOf(k.type, k.doc)],
        city: k.doc.city,
        phone: k.doc.phone,
        gstin: k.doc.gstin,
        status: k.doc.status,
        credit: await creditSummary(k.type, k.doc._id).catch(() => null),
        stock: await Vehicle.countDocuments(
          k.type === "DEALER" ? { status: "WITH_DEALER", currentLocationDealer: k.doc._id } : { status: "WITH_DISTRIBUTOR", currentLocationDistributor: k.doc._id }
        ),
      }))
    );
    return jsonResponse({
      parent: pdoc
        ? {
            partyType: parent.type,
            _id: pdoc._id,
            name: pdoc.name,
            code: pdoc.code,
            tier: tierOf(parent.type, pdoc),
            status: pdoc.status,
            territories: pdoc.territories || [],
            appointable: appointableTiers(tierOf(parent.type, pdoc), pdoc),
          }
        : null,
      children,
    });
  } catch (e) {
    return failure(e, "Failed to load partners");
  }
}

/** Appoint / onboard a partner (see createPartner for who may create what). */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const b = await req.json();
    return jsonResponse(await createPartner(b, auth.user), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create partner");
  }
}
