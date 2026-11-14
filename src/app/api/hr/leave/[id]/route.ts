import { handle } from "@/lib/route";
import { cancelLeave, decideLeave, HrError } from "@/services/hrService";

/** { action: "approve" | "reject" | "cancel", remarks } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "cancel") return cancelLeave(user, params.id);
  if (b.action === "approve" || b.action === "reject") return decideLeave(user, params.id, b.action === "approve" ? "APPROVED" : "REJECTED", b.remarks);
  throw new HrError("Unknown action");
}, "hr.self");
