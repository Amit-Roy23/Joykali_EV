import { connectToDatabase } from "@/lib/db";
import { NoDues } from "@/models/NoDues";

export const dynamic = "force-dynamic";

/** Public page behind the QR on a no dues certificate: was it really issued? */
export default async function VerifyNoDuesPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code);
  let nd: any = null;
  if (/^[A-Z0-9/-]{4,40}$/i.test(code)) {
    await connectToDatabase();
    nd = await NoDues.findOne({ code: code.toUpperCase(), status: "ISSUED" }).select("employeeName employeeCode designation lastWorkingDay issuedAt decision.byName decision.role").lean();
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-900 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Joykali EV Mobility · No dues check</p>
        {nd ? (
          <>
            <p className="mt-4 font-display text-2xl font-bold text-slate-900">{nd.employeeName}</p>
            <p className="text-sm text-slate-500">
              {nd.designation} · {nd.employeeCode}
            </p>
            <p className="mt-1 text-sm text-slate-600">Last working day {nd.lastWorkingDay}</p>
            <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-3 text-lg font-bold text-emerald-700">Genuine — no dues certificate {code.toUpperCase()}</p>
            <p className="mt-2 text-xs text-slate-500">
              Issued {new Date(nd.issuedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} · approved by {nd.decision?.byName} ({nd.decision?.role === "MANAGING_PARTNER" ? "Managing Partner" : "Business Head"})
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-2xl bg-rose-50 px-4 py-3 text-lg font-bold text-rose-700">No issued certificate with this number</p>
        )}
        <p className="mt-4 text-xs text-slate-400">Checked {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      </div>
    </main>
  );
}
