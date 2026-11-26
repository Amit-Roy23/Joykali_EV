import { handle } from "@/lib/route";
import { territoryTeam } from "@/services/territoryAssignService";

/** ASM → districts → FSEs → areas, with coverage gaps. */
export const GET = handle(async ({ user }) => territoryTeam(user), "network.view");
