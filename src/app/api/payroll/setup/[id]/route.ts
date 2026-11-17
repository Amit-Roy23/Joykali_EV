import { handle } from "@/lib/route";
import { withdrawTemplate } from "@/services/salaryTemplateService";

export const DELETE = handle(async ({ user, params }) => withdrawTemplate(user, params.id), "payroll.view");
