import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { getScopeFilter } from "@/lib/rbac";
import { proposeRevision, salaryHistory } from "@/services/salaryService";
import { approvalState, LEVEL_LABEL } from "@/lib/approval";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Employee not found", 404);
    const scope = await getScopeFilter(auth.user, "employees");
    const emp = await User.findOne({ $and: [{ _id: id }, scope] }).select("_id").lean();
    if (!emp) return errorResponse("Employee not found", 404);
    const history = await salaryHistory(id);
    return jsonResponse(
      history.map((h: any) => {
        const st = approvalState(h.approvals);
        return { ...h, waitingFor: h.status === "PENDING_APPROVAL" && st.next ? LEVEL_LABEL[st.next] : null };
      })
    );
  } catch (e) {
    return failure(e, "Failed to load salary");
  }
}

/** Propose a revision: { mode: "GROSS"|"CTC", amount (₹), flags, effectiveMonth: "YYYY-MM", reason, bankDetails?, pan? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "salary.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    const b = await req.json();
    const doc = await proposeRevision(
      id,
      { mode: b.mode, amountRupees: b.amount, flags: b.flags, effectiveMonth: b.effectiveMonth, reason: b.reason, bankDetails: b.bankDetails, pan: b.pan },
      auth.user
    );
    return jsonResponse(doc, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to propose revision");
  }
}
