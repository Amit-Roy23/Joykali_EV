import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Dealer } from "@/models/Dealer";
import { Vehicle } from "@/models/Vehicle";
import { Sale } from "@/models/Sale";
import {
  authenticateAndAuthorize,
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
    const dealer = await Dealer.findById(id)
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

    return jsonResponse({
      dealer,
      allocatedVehicles,
      salesHistory,
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
    if (body.gstin) dealer.gstin = body.gstin.toUpperCase().trim();
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

