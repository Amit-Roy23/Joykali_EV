import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { EMPLOYEE_ROLES } from "@/types";

export const dynamic = "force-dynamic";

/** Public page behind the QR code on an employee ID card: is this card still valid? */
export default async function VerifyIdPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let u: any = null;
  if (/^[A-Z0-9-]{4,20}$/i.test(code)) {
    await connectToDatabase();
    u = await User.findOne({ employeeCode: code.toUpperCase(), role: { $in: [...EMPLOYEE_ROLES] } }).select("name designation status profile.photo").lean();
  }
  const valid = u?.status === "ACTIVE";
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Joykali EV Mobility · ID check</p>
        {u ? (
          <>
            <p className="mt-4 font-display text-2xl font-bold text-slate-900">{u.name}</p>
            <p className="text-sm text-slate-500">{u.designation}</p>
            <p className="mt-1 font-mono text-sm text-slate-700">{code.toUpperCase()}</p>
            <p className={`mt-5 rounded-2xl px-4 py-3 text-lg font-bold ${valid ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {valid ? "Valid — currently employed" : "Not valid — no longer employed"}
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-lg font-bold text-rose-700">No employee with this code</p>
        )}
        <p className="mt-4 text-xs text-slate-400">Checked {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      </div>
    </main>
  );
}
