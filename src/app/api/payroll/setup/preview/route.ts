import { handle } from "@/lib/route";
import { previewTemplate } from "@/services/salaryTemplateService";

export const POST = handle(async ({ req }) => {
  const r = previewTemplate(await req.json());
  return r;
}, "payroll.view");
