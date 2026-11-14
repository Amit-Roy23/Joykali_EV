import { handle } from "@/lib/route";
import { verifyEmployeeDoc } from "@/services/hrMoneyService";

export const POST = handle(async ({ user, params }) => verifyEmployeeDoc(user, params.docId), "hr.manage");
