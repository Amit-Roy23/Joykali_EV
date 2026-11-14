import { handle, fileFrom } from "@/lib/route";
import { submitClaim } from "@/services/hrMoneyService";

/** multipart: date, category, amountRupees, description, kmTravelled?, bill? */
export const POST = handle(async ({ req, user }) => {
  const f = await req.formData();
  return submitClaim(user, {
    date: String(f.get("date") || ""),
    category: String(f.get("category") || ""),
    amountRupees: Number(f.get("amountRupees")),
    description: String(f.get("description") || ""),
    kmTravelled: f.get("kmTravelled") ? Number(f.get("kmTravelled")) : undefined,
    bill: await fileFrom(f, "bill"),
  });
}, "hr.self");
