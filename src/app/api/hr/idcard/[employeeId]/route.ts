import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { User } from "@/models/User";
import { Setting } from "@/models/Setting";
import { StoredFile } from "@/models/StoredFile";
import { HrError } from "@/services/hrService";
import { generateIdCardPDF } from "@/services/idCardPdf";

export const maxDuration = 60;

/** Printable ID card (front + back). The QR opens the public validity check. */
export const GET = handle(async ({ req, user, params }) => {
  if (params.employeeId !== user.userId && !(await hasPermission(user.role, "hr.manage"))) throw new HrError("Not allowed", 403);
  const emp: any = await User.findById(params.employeeId).populate("department", "name").lean();
  if (!emp) throw new HrError("Employee not found", 404);
  const s: any = await Setting.findOne().lean();
  const photo: any = emp.profile?.photo ? await StoredFile.findById(emp.profile.photo).lean() : null;
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const qrPng = await QRCode.toBuffer(`${origin}/verify/${encodeURIComponent(emp.employeeCode)}`, { margin: 1, width: 240 });
  const y = new Date().getFullYear();
  const pdf = await generateIdCardPDF({
    company: { name: s?.companyName || "Joykali EV Mobility", address: [s?.address, s?.city].filter(Boolean).join(", "), phone: s?.phone },
    emp: {
      name: emp.name,
      employeeCode: emp.employeeCode,
      designation: emp.designation,
      department: emp.department?.name,
      bloodGroup: emp.profile?.bloodGroup,
      joiningDate: emp.joiningDate,
      emergencyPhone: emp.profile?.emergencyPhone,
      phone: emp.phone,
    },
    photo: photo && /image\/(png|jpe?g)/.test(photo.contentType) ? { data: Buffer.from(photo.data.buffer || photo.data), contentType: photo.contentType } : null,
    qrPng,
    validTill: `31 Mar ${new Date().getMonth() >= 3 ? y + 1 : y}`,
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="IDCard_${emp.employeeCode}.pdf"` } });
}, "hr.self");
