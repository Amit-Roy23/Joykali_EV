import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { FleetVehicle } from "@/models/FleetVehicle";
import { Setting } from "@/models/Setting";
import { authenticateAndAuthorize, errorResponse, failure, isValidId } from "@/lib/apiHelper";
import { buildEwbJson } from "@/lib/gstDocs";

/**
 * E-way bill JSON in the NIC bulk-upload format. Upload it on the e-way bill
 * portal (Generate Bulk), then record the 12-digit EWB number on the DO.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Not found", 404);
    const d: any = await DeliveryOrder.findById(id).lean();
    if (!d) return errorResponse("Not found", 404);
    if (!d.document?.number) return errorResponse("Generate the invoice/challan first", 409);
    const km = Number(req.nextUrl.searchParams.get("distanceKm") || d.ewayBill?.distanceKm || 0);
    if (!km) return errorResponse("Enter the road distance first", 400);
    const s: any = await Setting.findOne().lean();
    const fleet: any = d.loading?.fleetVehicle ? await FleetVehicle.findById(d.loading.fleetVehicle).lean() : null;
    const json = buildEwbJson({
      docKind: d.document.kind,
      docNo: d.document.number,
      docDate: d.document.date,
      from: {
        gstin: s?.gstin || "",
        name: s?.companyName || "Joykali EV Mobility",
        address: s?.address || "",
        place: s?.city || "",
        pincode: s?.pincode || "",
        stateCode: s?.stateCode || "19",
      },
      to: {
        gstin: d.partySnapshot.gstin,
        name: d.partySnapshot.name,
        address: d.partySnapshot.address,
        place: d.partySnapshot.city,
        pincode: d.partySnapshot.pincode,
        stateCode: d.partySnapshot.stateCode,
      },
      lines: d.lines,
      distanceKm: km,
      vehicleNo: d.loading?.registrationNo || "",
      transporterName: fleet?.ownership === "HIRED" ? fleet?.transporterName : undefined,
      transporterId: fleet?.ownership === "HIRED" ? fleet?.transporterGstin : undefined,
    });
    return new NextResponse(JSON.stringify(json, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="EWB_${d.document.number.replace(/\//g, "_")}.json"`,
      },
    });
  } catch (e) {
    return failure(e, "Failed to build e-way bill JSON");
  }
}
