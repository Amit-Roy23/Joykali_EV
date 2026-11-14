import { handle } from "@/lib/route";
import { decideRegularization } from "@/services/hrService";

export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  return decideRegularization(user, params.id, b.decision === "APPROVED" ? "APPROVED" : "REJECTED", b.remarks);
}, "hr.self");
