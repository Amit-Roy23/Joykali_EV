import { handle } from "@/lib/route";
import { proposeTemplate, templateOverview } from "@/services/salaryTemplateService";

export const GET = handle(async () => templateOverview(), "payroll.view");
/** { effectiveFrom, components, statutory, reason } — goes to BH then MP. */
export const POST = handle(async ({ req, user }) => proposeTemplate(user, await req.json()), "payroll.view");
