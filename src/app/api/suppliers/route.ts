import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Supplier } from "@/models/Supplier";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const suppliers = await Supplier.find({ isActive: true }).sort({ name: 1 }).lean();
    return jsonResponse(suppliers);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch suppliers", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "purchase.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const supplier = await Supplier.create({
      name: body.name.trim(),
      gstin: body.gstin.toUpperCase().trim(),
      contactPerson: body.contactPerson.trim(),
      phone: body.phone.trim(),
      email: body.email.toLowerCase().trim(),
      address: body.address.trim(),
      city: body.city.trim(),
      state: body.state.trim(),
      isActive: true,
    });

    return jsonResponse(supplier, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create supplier", 500);
  }
}

