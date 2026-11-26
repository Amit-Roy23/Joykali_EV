"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, KeyRound, ShieldAlert, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { AccountsTabs } from "@/components/accounts";

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const NOTES = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
const REASONS: Array<[string, string]> = [
  ["SICK", "Ill / medical leave"],
  ["LEAVE", "On leave"],
  ["SHIFT", "Shift change"],
  ["TRANSFER", "Moved to other work"],
  ["RESIGNED", "Leaving the company"],
  ["OTHER", "Other"],
];
const TYPE_LABEL: Record<string, string> = { HANDOVER: "Handed over", COVER: "Cover (temporary)", RETURN: "Returned after cover" };
const ROLE_SHORT: Record<string, string> = { FEC: "FSE", BUSINESS_HEAD: "BH", MANAGING_PARTNER: "MP", HR_MANAGER: "HR", STORE_MANAGER: "Store", ACCOUNTANT: "Accounts" };

/** Note-by-note count; gives the total in rupees. */
function NoteCounter({ value, onChange }: { value: Record<number, string>; onChange: (v: Record<number, string>) => void }) {
  const total = NOTES.reduce((s, n) => s + n * (Number(value[n]) || 0), 0);
  return (
    <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="mb-2 text-xs font-semibold text-slate-600">Count by notes (optional)</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-5">
        {NOTES.map((n) => (
          <label key={n} className="flex items-center gap-1.5 text-xs">
            <span className="w-11 text-right font-mono">₹{n}×</span>
            <input
              inputMode="numeric"
              className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={value[n] || ""}
              onChange={(e) => onChange({ ...value, [n]: e.target.value.replace(/\D/g, "") })}
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-right text-sm font-semibold">Total ₹{total.toLocaleString("en-IN")}</p>
    </div>
  );
}
const noteList = (v: Record<number, string>) => NOTES.map((n) => ({ note: n, count: Number(v[n]) || 0 })).filter((d) => d.count > 0);
const noteTotal = (v: Record<number, string>) => NOTES.reduce((s, n) => s + n * (Number(v[n]) || 0), 0);

/**
 * Who holds each cash box, and a counted handover every time that changes —
 * for good (new cashier) or as a cover while the cashier is ill or on leave.
 */
export default function CashHandoverPage() {
  const { user } = useSession();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [start, setStart] = useState<any>(null);
  const [accept, setAccept] = useState<any>(null);
  const [settle, setSettle] = useState<any>(null);
  const [cancel, setCancel] = useState<any>(null);
  const load = useCallback(() => {
    api<any>("/api/accounts/handover").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const done = (m: string) => {
    setStart(null);
    setAccept(null);
    setSettle(null);
    setCancel(null);
    setOk(m);
    load();
  };

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Cash handover"
        description="Each cash box has one person holding it — only they pay cash from it. When the cashier changes, or someone covers while the cashier is ill or on leave, the cash is counted and handed over here, and any shortage is recorded."
      />
      {d?.full && <AccountsTabs />}
      {err && <Notice>{err}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
      {!d ? (
        !err && <Skeleton className="h-64" />
      ) : (
        <>
          {d.forMe.length > 0 && (
            <Card className="border-brand-200 bg-brand-50/50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-900">
                <KeyRound className="h-4 w-4" /> Cash waiting for you to count and accept
              </p>
              {d.forMe.map((h: any) => (
                <div key={h._id} className="flex flex-wrap items-center gap-3 border-t border-brand-100 py-2 text-sm first:border-0">
                  <div className="flex-1">
                    <b>{h.accountName}</b> from {h.fromName || "—"} · {TYPE_LABEL[h.type]}
                    {h.expectedReturn && ` until ${h.expectedReturn}`}
                    <p className="text-xs text-slate-600">
                      Book {rupees(h.bookBalanceAtStart)}
                      {h.countedByFrom != null ? ` · counted by ${h.fromName || "outgoing"}: ${rupees(h.countedByFrom)}` : " · outgoing cashier was not there to count"}
                      {h.note && ` · ${h.note}`}
                    </p>
                  </div>
                  <Button id={`accept-${h.code}`} onClick={() => setAccept(h)}>
                    Count & accept
                  </Button>
                </div>
              ))}
            </Card>
          )}

          {d.full && (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {d.boxes.map((b: any) => (
                  <Card key={b._id} className="p-4" data-box={b.name}>
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">{b.name}</p>
                        <p className="text-xl font-bold tabular">{rupees(b.balance)}</p>
                        <p className="text-xs text-slate-500">as per cash book today</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <p>
                        Held by: <b>{b.custodianName || <span className="text-amber-700">nobody yet</span>}</b>
                        {b.iHold && <Badge variant="success" className="ml-2">You</Badge>}
                      </p>
                      {b.regularCustodianName && (
                        <p className={cn("text-xs", b.coverOverdue ? "font-semibold text-rose-600" : "text-amber-700")}>
                          Covering for {b.regularCustodianName} until {b.coverUntil}
                          {b.coverOverdue && " — overdue, hand it back"}
                        </p>
                      )}
                      {b.pending && (
                        <p className="text-xs text-brand-700">
                          Handover to {b.pending.toName} waiting to be accepted ({b.pending.code})
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!b.pending && (b.iHold || d.canStartAny) && (
                        <>
                          <Button size="sm" id={`handover-${b._id}`} onClick={() => setStart({ box: b, type: b.regularCustodianName ? "RETURN" : "COVER" })}>
                            {b.regularCustodianName ? "Hand back" : "Hand over"}
                          </Button>
                          {b.regularCustodianName && (
                            <Button size="sm" variant="outline" onClick={() => setStart({ box: b, type: "HANDOVER" })}>
                              Hand over for good
                            </Button>
                          )}
                        </>
                      )}
                      {b.pending && (b.pending.startedBy === user?.userId || d.canStartAny) && (
                        <Button size="sm" variant="ghost" onClick={() => setCancel(b.pending)}>
                          Cancel handover
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {d.openDifferences.length > 0 && (
                <Card className="border-rose-200 bg-rose-50/50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-900">
                    <ShieldAlert className="h-4 w-4" /> Cash differences to settle
                  </p>
                  {d.openDifferences.map((h: any) => (
                    <div key={h._id} className="flex flex-wrap items-center gap-3 border-t border-rose-100 py-2 text-sm first:border-0">
                      <div className="flex-1">
                        <b>{h.code}</b> · {h.accountName}: {h.fromName || "—"} → {h.toName} ·{" "}
                        <span className={h.difference < 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
                          {h.difference < 0 ? "short" : "excess"} {rupees(Math.abs(h.difference))}
                        </span>
                        <p className="text-xs text-slate-600">
                          Book {rupees(h.bookBalanceAtAccept)} · counted {rupees(h.countedByTo)} · {h.acceptNote}
                        </p>
                      </div>
                      {d.canStartAny && (
                        <Button size="sm" variant="outline" onClick={() => setSettle(h)}>
                          Settle
                        </Button>
                      )}
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          <Card className="overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Handover log</p>
            {d.log.length === 0 ? (
              <EmptyState icon={KeyRound} title="No handovers yet" description="Every change of who holds the cash will be listed here, with the count." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" id="handover-log">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Code / date</th>
                      <th className="px-3 py-2">Cash box</th>
                      <th className="px-3 py-2">From → to</th>
                      <th className="px-3 py-2">Why</th>
                      <th className="px-3 py-2 text-right">Book</th>
                      <th className="px-3 py-2 text-right">Counted</th>
                      <th className="px-3 py-2 text-right">Difference</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.log.map((h: any) => (
                      <tr key={h._id} className="border-t border-slate-100 align-top">
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="font-mono">{h.code}</span>
                          <p className="text-slate-500">{dt(h.acceptedAt || h.createdAt, true)}</p>
                        </td>
                        <td className="px-3 py-2">{h.accountName}</td>
                        <td className="px-3 py-2">
                          {h.fromName || "—"} <ArrowRight className="inline h-3 w-3" /> <b>{h.toName}</b>
                          {h.outgoingAbsent && <p className="text-[11px] text-amber-700">started by {h.startedByName} (cashier away)</p>}
                        </td>
                        <td className="px-3 py-2">
                          {TYPE_LABEL[h.type]}
                          {h.type !== "RETURN" && ` · ${REASONS.find((r) => r[0] === h.reason)?.[1]}`}
                          {h.expectedReturn && <p className="text-[11px] text-slate-500">back by {h.expectedReturn}</p>}
                          {h.note && <p className="text-[11px] text-slate-500">{h.note}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular">{rupees(h.bookBalanceAtAccept ?? h.bookBalanceAtStart)}</td>
                        <td className="px-3 py-2 text-right tabular">
                          {h.countedByTo != null ? rupees(h.countedByTo) : h.countedByFrom != null ? rupees(h.countedByFrom) : "—"}
                        </td>
                        <td className={cn("px-3 py-2 text-right tabular font-semibold", (h.difference || 0) < 0 ? "text-rose-600" : (h.difference || 0) > 0 ? "text-emerald-700" : "text-slate-400")}>
                          {h.difference ? `${h.difference < 0 ? "−" : "+"}${rupees(Math.abs(h.difference))}` : h.status === "ACCEPTED" ? "nil" : ""}
                          {h.settlement?.status && !["NONE", "OPEN"].includes(h.settlement.status) && (
                            <p className="text-[11px] font-normal text-slate-500">{h.settlement.status === "WRITTEN_OFF" ? "written off" : "made good"} · {h.settlement.byName}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={h.status === "ACCEPTED" ? (h.settlement?.status === "OPEN" ? "destructive" : "success") : h.status === "PENDING" ? "warning" : "secondary"}>
                            {h.status === "ACCEPTED" ? (h.settlement?.status === "OPEN" ? "Difference open" : "Accepted") : h.status === "PENDING" ? "Waiting" : "Cancelled"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {start && <StartModal {...start} staff={d.staff} me={user?.userId} onClose={() => setStart(null)} onDone={done} />}
      {accept && <AcceptModal h={accept} onClose={() => setAccept(null)} onDone={done} />}
      {settle && <SettleModal h={settle} onClose={() => setSettle(null)} onDone={done} />}
      {cancel && <CancelModal h={cancel} onClose={() => setCancel(null)} onDone={done} />}
    </div>
  );
}

function StartModal({ box, type: initial, staff, me, onClose, onDone }: { box: any; type: string; staff: any[]; me: string; onClose: () => void; onDone: (m: string) => void }) {
  const [type, setType] = useState(initial);
  const [f, setF] = useState({ toUserId: "", reason: "SICK", expectedReturn: "", countedRupees: "", note: "" });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holderAway = !box.iHold;
  const counted = noteTotal(notes) || Number(f.countedRupees) || 0;
  const people = useMemo(() => staff.filter((s) => String(s._id) !== String(box.custodian)), [staff, box]);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<any>("/api/accounts/handover", {
        method: "POST",
        json: { accountId: box._id, type, ...f, countedRupees: f.countedRupees === "" && !noteTotal(notes) ? "" : counted, denominations: noteList(notes) },
      });
      onDone(`${r.code}: ${r.toName} has been asked to count and accept the cash.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const sel = "h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm";
  return (
    <Modal isOpen onClose={onClose} title={`${type === "RETURN" ? "Hand back" : "Hand over"} — ${box.name}`} maxWidth="2xl">
      {type !== "RETURN" && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            ["COVER", "Cover while away", "Someone holds the cash while the cashier is ill / on leave; it comes back after"],
            ["HANDOVER", "Hand over for good", "New cashier from now on"],
          ].map(([k, l, h]) => (
            <button key={k} type="button" data-type={k} onClick={() => setType(k)} className={cn("rounded-lg p-2.5 text-left ring-1", type === k ? "bg-brand-50 ring-brand-400" : "ring-slate-200")}>
              <p className="text-sm font-semibold">{l}</p>
              <p className="text-[11px] text-slate-500">{h}</p>
            </button>
          ))}
        </div>
      )}
      <p className="mb-3 text-xs text-slate-600">
        Cash book today: <b>{rupees(box.balance)}</b> · held by {box.custodianName || "nobody"}
        {type === "RETURN" && ` · goes back to ${box.regularCustodianName}`}
      </p>
      {holderAway && box.custodianName && (
        <Notice tone="warning" className="mb-3">
          {box.custodianName} is not doing this — count the cash with a witness and write who was present in the note.
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {type !== "RETURN" && (
          <div className="space-y-1.5">
            <Label>Hand to</Label>
            <select id="ho-to" className={sel} value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })}>
              <option value="">Choose a person…</option>
              {people.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({ROLE_SHORT[s.role] || s.role.charAt(0) + s.role.slice(1).toLowerCase()}){String(s._id) === me ? " — me" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {type !== "RETURN" && (
          <div className="space-y-1.5">
            <Label>Why</Label>
            <select id="ho-reason" className={sel} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}>
              {REASONS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        {type === "COVER" && (
          <div className="space-y-1.5">
            <Label>Cashier expected back on</Label>
            <Input id="ho-return" type="date" min={istToday()} value={f.expectedReturn} onChange={(e) => setF({ ...f, expectedReturn: e.target.value })} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Cash counted now (₹){holderAway ? " — optional" : ""}</Label>
          <Input id="ho-count" type="number" min={0} value={noteTotal(notes) ? String(noteTotal(notes)) : f.countedRupees} disabled={!!noteTotal(notes)} onChange={(e) => setF({ ...f, countedRupees: e.target.value })} />
          {counted > 0 && counted * 100 !== box.balance && <p className="text-xs text-amber-700">Differs from the book by {rupees(Math.abs(counted * 100 - box.balance))} ({counted * 100 < box.balance ? "short" : "more"}).</p>}
        </div>
        <div className="sm:col-span-2">
          <NoteCounter value={notes} onChange={setNotes} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Note</Label>
          <Input id="ho-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={holderAway ? "e.g. Counted with Ananya (BH) as witness; Rina is in hospital" : "e.g. Keys of the cash box and petty-cash file handed over"} />
        </div>
      </div>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button id="ho-save" disabled={busy} onClick={go}>
          Send for acceptance
        </Button>
      </div>
    </Modal>
  );
}

function AcceptModal({ h, onClose, onDone }: { h: any; onClose: () => void; onDone: (m: string) => void }) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = noteTotal(notes) || Number(counted) || 0;
  const diff = total * 100 - h.bookBalanceAtStart;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<any>(`/api/accounts/handover/${h._id}`, { method: "POST", json: { action: "accept", countedRupees: total, denominations: noteList(notes), note } });
      onDone(r.difference ? `You now hold ${h.accountName}. The ${r.difference < 0 ? "shortage" : "excess"} of ${rupees(Math.abs(r.difference))} has been reported for settlement.` : `You now hold ${h.accountName} — count matched the book.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Count & accept — ${h.accountName}`} maxWidth="2xl">
      <p className="mb-3 text-sm">
        From <b>{h.fromName || "—"}</b> · {TYPE_LABEL[h.type]}
        {h.expectedReturn && ` until ${h.expectedReturn}`}. Cash book: <b>{rupees(h.bookBalanceAtStart)}</b>
        {h.countedByFrom != null && <> · they counted {rupees(h.countedByFrom)}</>}
      </p>
      <p className="mb-3 text-xs text-slate-600">Count the cash yourself. Once you accept, you hold this cash box and pay cash from it; the cashier&apos;s screens open for you until you hand it on.</p>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Cash I counted (₹)</Label>
          <Input id="acc-count" type="number" min={0} value={noteTotal(notes) ? String(noteTotal(notes)) : counted} disabled={!!noteTotal(notes)} onChange={(e) => setCounted(e.target.value)} />
          {total > 0 && diff !== 0 && <p className={cn("text-xs font-semibold", diff < 0 ? "text-rose-600" : "text-emerald-700")}>{diff < 0 ? "Short" : "More"} by {rupees(Math.abs(diff))} against the book — say why below.</p>}
        </div>
        <NoteCounter value={notes} onChange={setNotes} />
        <div className="space-y-1.5">
          <Label>Note{diff !== 0 && total > 0 ? " (needed)" : " (optional)"}</Label>
          <Input id="acc-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Not now
        </Button>
        <Button id="acc-save" disabled={busy || counted === "" && !noteTotal(notes)} onClick={go}>
          Accept the cash
        </Button>
      </div>
    </Modal>
  );
}

function SettleModal({ h, onClose, onDone }: { h: any; onClose: () => void; onDone: (m: string) => void }) {
  const [how, setHow] = useState(h.difference < 0 ? "MADE_GOOD" : "WRITTEN_OFF");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = h.difference < 0;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/accounts/handover/${h._id}`, { method: "POST", json: { action: "settle", how, note } });
      onDone(`${h.code} settled.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Settle ${short ? "shortage" : "excess"} — ${h.code}`}>
      <p className="mb-3 text-sm">
        {h.accountName}: book {rupees(h.bookBalanceAtAccept)}, counted {rupees(h.countedByTo)} — <b>{short ? "short" : "excess"} {rupees(Math.abs(h.difference))}</b>
      </p>
      <div className="space-y-2">
        {short && (
          <label className="flex gap-2 text-sm">
            <input type="radio" checked={how === "MADE_GOOD"} onChange={() => setHow("MADE_GOOD")} />
            <span>
              <b>Made good</b> — the person put the missing cash back (no entry; the box now matches the book)
            </span>
          </label>
        )}
        <label className="flex gap-2 text-sm">
          <input type="radio" checked={how === "WRITTEN_OFF"} onChange={() => setHow("WRITTEN_OFF")} />
          <span>
            <b>{short ? "Write off" : "Take into books"}</b> — posts a {short ? "payment" : "receipt"} voucher “{short ? "Cash shortage written off" : "Cash excess found"}” so the book equals the cash counted
          </span>
        </label>
      </div>
      <div className="mt-3 space-y-1.5">
        <Label>Decision note</Label>
        <Input id="settle-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rina repaid ₹200 on return" />
      </div>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button id="settle-go" disabled={busy || !note.trim()} onClick={go}>
          Settle
        </Button>
      </div>
    </Modal>
  );
}

function CancelModal({ h, onClose, onDone }: { h: any; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    try {
      await api(`/api/accounts/handover/${h._id}`, { method: "POST", json: { action: "cancel", reason } });
      onDone(`${h.code} cancelled.`);
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Cancel ${h.code}`}>
      <Label>Reason</Label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Back
        </Button>
        <Button disabled={!reason.trim()} onClick={go}>
          Cancel handover
        </Button>
      </div>
    </Modal>
  );
}
