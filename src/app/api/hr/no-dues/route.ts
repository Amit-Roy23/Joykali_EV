import { handle } from "@/lib/route";
import { listNoDues, openNoDues } from "@/services/noDuesService";

export const GET = handle(async ({ user }) => listNoDues(user), "hr.self");
/** { employeeId } — HR opens a no dues certificate for someone leaving. */
export const POST = handle(async ({ req, user }) => openNoDues(user, (await req.json()).employeeId));
