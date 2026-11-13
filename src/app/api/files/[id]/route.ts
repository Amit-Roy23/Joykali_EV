import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { StoredFile } from "@/models/StoredFile";
import { authenticateAndAuthorize, errorResponse, failure, isValidId } from "@/lib/apiHelper";

/** Download a stored fleet document scan. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("File not found", 404);
    const f = await StoredFile.findById(id).lean();
    if (!f) return errorResponse("File not found", 404);
    // lean() returns a BSON Binary; its .buffer holds the bytes.
    const bytes = Buffer.from((f.data as any)?.buffer ?? (f.data as any));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": f.contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return failure(e, "Failed to load file");
  }
}
