import { handle, fileFrom } from "@/lib/route";
import { punch } from "@/services/hrService";

/** multipart: lat, lng, accuracy, device, note, photo (selfie) */
export const POST = handle(async ({ req, user }) => {
  const form = await req.formData();
  // a missing field must stay "missing" (Number(null) would be 0 = a real place in the Atlantic)
  const num = (k: string) => {
    const v = form.get(k);
    return v == null || String(v).trim() === "" ? NaN : Number(v);
  };
  return punch(user, {
    lat: num("lat"),
    lng: num("lng"),
    accuracy: num("accuracy") || 0,
    device: String(form.get("device") || req.headers.get("user-agent") || ""),
    note: String(form.get("note") || ""),
    photo: await fileFrom(form, "photo"),
  });
}, "hr.self");
