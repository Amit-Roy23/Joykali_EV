import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { StoredFile } from "@/models/StoredFile";
import { FleetVehicle } from "@/models/FleetVehicle";
import { PartyDocument } from "@/models/PartyDocument";
import { User } from "@/models/User";
import { AttendancePunch, EmployeeDocument, ExpenseClaim } from "@/models/Hr";
import { authenticateAndAuthorize, errorResponse, failure, isValidId } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { JWTPayload } from "@/types";
import { canActOnParty } from "@/services/networkService";
import { teamScope } from "@/services/hrService";

/**
 * Who may open a stored file depends on what the file belongs to:
 * the uploader; fleet papers → fleet.view; KYC papers → the partner, its supplier and staff;
 * punch selfies, employee documents, claim bills, photos → the employee, their managers, HR / approvers.
 */
async function canOpen(user: JWTPayload, fileId: mongoose.Types.ObjectId, uploadedBy: any) {
  if (String(uploadedBy) === user.userId) return true;
  if (await FleetVehicle.exists({ "documents.file": fileId })) return hasPermission(user.role, "fleet.view");
  const kyc: any = await PartyDocument.findOne({ file: fileId }).select("partyType party").lean();
  if (kyc) return (await canActOnParty(user, kyc.partyType, kyc.party)).ok;
  const photoOf: any = await User.findOne({ "profile.photo": fileId }).select("_id").lean();
  const owner: any =
    (await AttendancePunch.findOne({ photo: fileId }).select("employee").lean()) ||
    (await EmployeeDocument.findOne({ file: fileId }).select("employee").lean()) ||
    (await ExpenseClaim.findOne({ bill: fileId }).select("employee").lean()) ||
    (photoOf ? { employee: photoOf._id } : null);
  if (owner?.employee) {
    if (String(owner.employee) === user.userId) return true;
    if ((await hasPermission(user.role, "hr.manage")) || (await hasPermission(user.role, "approvals.sign"))) return true;
    const scope = await teamScope(user);
    return !scope || scope.some((s) => String(s) === String(owner.employee));
  }
  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("File not found", 404);
    const f = await StoredFile.findById(id).lean();
    if (!f || !(await canOpen(auth.user, f._id as mongoose.Types.ObjectId, f.uploadedBy))) return errorResponse("File not found", 404);
    // lean() returns a BSON Binary; its .buffer holds the bytes.
    const bytes = Buffer.from((f.data as any)?.buffer ?? (f.data as any));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": f.contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e, "Failed to load file");
  }
}
