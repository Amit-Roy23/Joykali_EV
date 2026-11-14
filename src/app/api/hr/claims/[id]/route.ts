import { handle } from "@/lib/route";
import { verifyClaim } from "@/services/hrMoneyService";

/** Manager check: { decision: "VERIFIED" | "REJECTED", reason } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  return verifyClaim(user, params.id, b.decision === "VERIFIED" ? "VERIFIED" : "REJECTED", b.reason);
}, "hr.self");
