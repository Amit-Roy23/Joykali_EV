import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Setting } from "@/models/Setting";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    let setting: any = await Setting.findOne().lean();
    if (!setting) {
      const created = await Setting.create({
        companyName: "Joykali EV Mobility",
        address: "NH-34, EV Hub, Barasat",
        city: "Kolkata",
        state: "West Bengal",
        pincode: "700124",
        gstin: "19AAACJ1234F1Z5",
        pan: "AAACJ1234F",
        phone: "+91 98765 43210",
        email: "contact@joykaliev.in",
      });
      setting = created.toObject();
    }

    return jsonResponse(setting);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch settings", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "settings.manage");
    if (auth.error) return auth.error;

    const body = await req.json();

    const setting = await Setting.findOneAndUpdate(
      {},
      {
        ...body,
        updatedBy: new mongoose.Types.ObjectId(auth.user.userId),
      },
      { upsert: true, new: true }
    );

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "SETTINGS",
      resourceId: String(setting._id),
      after: body,
    });

    return jsonResponse(setting);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to update settings", 500);
  }
}

