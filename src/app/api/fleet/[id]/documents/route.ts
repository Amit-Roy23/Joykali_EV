import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { FleetVehicle, FLEET_DOC_TYPES } from "@/models/FleetVehicle";
import { StoredFile } from "@/models/StoredFile";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";

const MAX = 2 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * Add or renew a document (multipart form): type, number, validUpto (YYYY-MM-DD,
 * empty only for RC), issuedOn?, issuer?, file? (PDF/JPG/PNG ≤ 2 MB).
 * Renewing keeps the old entry as history; the latest validity counts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Vehicle not found", 404);
    const f = await FleetVehicle.findById(id);
    if (!f) return errorResponse("Vehicle not found", 404);
    const form = await req.formData();
    const type = String(form.get("type") || "");
    const number = String(form.get("number") || "").trim();
    const validUptoRaw = String(form.get("validUpto") || "");
    const issuedOnRaw = String(form.get("issuedOn") || "");
    if (!(FLEET_DOC_TYPES as readonly string[]).includes(type)) return errorResponse("Choose a document type", 400);
    if (number.length < 3) return errorResponse("Enter the document / policy / certificate number", 400);
    if (!validUptoRaw && type !== "RC") return errorResponse("Enter the valid-until date", 400);
    const validUpto = validUptoRaw ? new Date(`${validUptoRaw}T00:00:00+05:30`) : null;
    const issuedOn = issuedOnRaw ? new Date(`${issuedOnRaw}T00:00:00+05:30`) : null;
    if (validUpto && Number.isNaN(+validUpto)) return errorResponse("Invalid valid-until date", 400);
    if (issuedOn && validUpto && issuedOn > validUpto) return errorResponse("Issue date is after the expiry date", 400);

    let fileId: mongoose.Types.ObjectId | null = null;
    let fileName: string | undefined;
    const file = form.get("file");
    if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
      const fl = file as File;
      if (fl.size > MAX) return errorResponse("File too large — max 2 MB", 400);
      if (!TYPES.includes(fl.type)) return errorResponse("Upload a PDF, JPG or PNG", 400);
      const stored = await StoredFile.create({
        name: fl.name,
        contentType: fl.type,
        size: fl.size,
        data: Buffer.from(await fl.arrayBuffer()),
        uploadedBy: new mongoose.Types.ObjectId(auth.user.userId),
      });
      fileId = stored._id as mongoose.Types.ObjectId;
      fileName = fl.name;
    }

    f.documents.push({
      type: type as any,
      number,
      validUpto,
      issuedOn,
      issuer: String(form.get("issuer") || "").trim() || undefined,
      file: fileId,
      fileName,
      updatedBy: new mongoose.Types.ObjectId(auth.user.userId),
      updatedAt: new Date(),
    });
    await f.save();
    await logAudit({ user: auth.user, action: "UPLOAD", resource: "FLEET", resourceId: id, after: { type, number, validUpto } });
    return jsonResponse(f, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to save document");
  }
}
