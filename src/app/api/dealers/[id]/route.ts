import { NextRequest } from "next/server";
import { creditSummary } from "@/services/creditService";
import { ChannelOrder } from "@/models/ChannelOrder";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { getScopeFilter } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import { Dealer } from "@/models/Dealer";
import { Vehicle } from "@/models/Vehicle";
import { Sale } from "@/models/Sale";
import {
  authenticateAndAuthorize,
  isValidId,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dealer.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Dealer not found", 404);
    const scope = await getScopeFilter(auth.user, "dealers");
    const dealer = await Dealer.findOne({ $and: [{ _id: id }, scope] })
      .populate("assignedASM", "name employeeCode")
      .lean();

    if (!dealer) return errorResponse("Dealer not found", 404);

    // List of vehicles currently allocated to this dealer
    const allocatedVehicles = await Vehicle.find({
      currentLocationDealer: dealer._id,
      status: "ALLOCATED_TO_DEALER",
    })
      .populate("model", "name variant category")
      .sort({ createdAt: -1 })
      .lean();

    // Sales history through this dealer
    const salesHistory = await Sale.find({ dealer: dealer._id })
      .populate("vehicle")
      .populate("soldBy", "name employeeCode")
      .sort({ saleDate: -1 })
      .lean();

    const [credit, orders, creditChanges] = await Promise.all([
      creditSummary("DEALER", dealer._id as any).catch(() => null),
      ChannelOrder.find({ partyType: "DEALER", party: dealer._id }).sort({ createdAt: -1 }).limit(15).lean(),
      CreditLimitChange.find({ partyType: "DEALER", party: dealer._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return jsonResponse({
      dealer,
      allocatedVehicles,
      salesHistory,
      credit,
      orders,
      creditChanges,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch dealer details", 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dealer.manage");
    // (credit limits change only through an approved credit request)
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await req.json();

    const dealer = await Dealer.findById(id);
    if (!dealer) return errorResponse("Dealer not found", 404);

    const beforeState = dealer.toObject();

    if (body.name) dealer.name = body.name.trim();
    if (body.ownerName) dealer.ownerName = body.ownerName.trim();
    if (body.phone) dealer.phone = body.phone.trim();
    if (body.email) dealer.email = body.email.toLowerCase().trim();
    if (body.address) dealer.address = body.address.trim();
    if (body.city) dealer.city = body.city.trim();
    if (body.state) dealer.state = body.state.trim();
    if (body.gstin) {
      dealer.gstin = body.gstin.toUpperCase().trim();
      dealer.stateCode = dealer.gstin.slice(0, 2); // GST state code = first two GSTIN digits
    }
    if (body.pincode !== undefined) dealer.pincode = String(body.pincode).trim();
    if (body.creditDays !== undefined || body.creditLimit !== undefined) {
      return errorResponse("Credit terms change only through an approved credit request", 400);
    }
    if (body.status) dealer.status = body.status;
    if (body.assignedASM !== undefined) {
      dealer.assignedASM = body.assignedASM ? new mongoose.Types.ObjectId(body.assignedASM) : null;
    }
    dealer.updatedBy = new mongoose.Types.ObjectId(auth.user.userId);

    await dealer.save();

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "DEALER",
      resourceId: String(dealer._id),
      before: beforeState,
      after: dealer.toObject(),
    });

    return jsonResponse(dealer);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to update dealer", 500);
  }
}

