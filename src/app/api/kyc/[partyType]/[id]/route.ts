import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { listPartyDocuments, uploadPartyDocument } from "@/services/partnerAdminService";

type P = { params: Promise<{ partyType: string; id: string }> };
const ok = (t: string) => t === "DEALER" || t === "DISTRIBUTOR";

export async function GET(req: NextRequest, { params }: P) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    if (!ok(partyType) || !isValidId(id)) return errorResponse("Not found", 404);
    return jsonResponse(await listPartyDocuments(auth.user, partyType as any, id));
  } catch (e) {
    return failure(e, "Failed to load documents");
  }
}

/** multipart: docType, number?, validTill? (YYYY-MM-DD), file? (PDF/JPG/PNG ≤ 2 MB) */
export async function POST(req: NextRequest, { params }: P) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    if (!ok(partyType) || !isValidId(id)) return errorResponse("Not found", 404);
    const form = await req.formData();
    const f = form.get("file");
    let file = null;
    if (f && typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0) {
      const fl = f as File;
      file = { name: fl.name, type: fl.type, data: Buffer.from(await fl.arrayBuffer()) };
    }
    const validTill = String(form.get("validTill") || "");
    const doc = await uploadPartyDocument(auth.user, partyType as any, id, {
      docType: String(form.get("docType") || ""),
      number: String(form.get("number") || ""),
      validTill: validTill ? `${validTill}T23:59:59+05:30` : undefined,
      file,
    });
    return jsonResponse(doc, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to upload document");
  }
}
