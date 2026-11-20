"use client";

import { ROLE_SHORT } from "@/components/ui/kit";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { computeIncentives } from "@/services/incentiveEngine";
import { formatINR, rupeesToPaise } from "@/lib/money";

type RuleType = "PER_UNIT" | "SLAB" | "TARGET_BONUS" | "PERCENTAGE" | "TEAM_OVERRIDE" | "DEALER_RECRUITMENT" | "TARGET_COMMISSION";

interface RuleDraft {
  ruleType: RuleType;
  perUnitAmount: number;
  slabs: Array<{ minUnits: number; maxUnits: number | null; amountPerUnit: number }>;
  slabApplication: "ALL_UNITS" | "INCREMENTAL";
  targetUnits: number;
  targetBonusAmount: number;
  percentageRate: number;
  teamOverridePerUnit: number;
  minRecruits: number;
  perRecruitAmount: number;
  perDistributorAmount: number;
  countSubDealers: boolean;
  targetPayout: "ALL_WHEN_MET" | "ABOVE_TARGET";
}

const RULE_TYPES: Array<{ type: RuleType; label: string; desc: string }> = [
  { type: "DEALER_RECRUITMENT", label: "Dealer recruitment", desc: "₹ per dealer appointed, after a minimum" },
  { type: "TARGET_COMMISSION", label: "Target commission", desc: "₹ per vehicle against monthly target" },
  { type: "SLAB", label: "Slab tiers", desc: "Tiered by units" },
  { type: "PER_UNIT", label: "Per-unit", desc: "Fixed ₹ / vehicle" },
  { type: "TARGET_BONUS", label: "Target bonus", desc: "Lump sum on hitting a target" },
  { type: "PERCENTAGE", label: "Commission %", desc: "% of ex-showroom" },
  { type: "TEAM_OVERRIDE", label: "Team override", desc: "For area managers" },
];
const LABEL = Object.fromEntries(RULE_TYPES.map((r) => [r.type, r.label])) as Record<RuleType, string>;

const blank = (ruleType: RuleType): RuleDraft => ({
  ruleType,
  perUnitAmount: ruleType === "TARGET_COMMISSION" ? 500 : 1000,
  slabs: [
    { minUnits: 1, maxUnits: 5, amountPerUnit: 500 },
    { minUnits: 6, maxUnits: 10, amountPerUnit: 800 },
    { minUnits: 11, maxUnits: null, amountPerUnit: 1200 },
  ],
  slabApplication: "ALL_UNITS",
  targetUnits: ruleType === "TARGET_COMMISSION" ? 10 : 15,
  targetBonusAmount: 10000,
  percentageRate: 1.5,
  teamOverridePerUnit: 300,
  minRecruits: 5,
  perRecruitAmount: 1000,
  perDistributorAmount: 0,
  countSubDealers: true,
  targetPayout: "ALL_WHEN_MET",
});

/** Rule as sent to the API (rupees; the API converts to paise). */
function payload(r: RuleDraft) {
  switch (r.ruleType) {
    case "PER_UNIT":
      return { ruleType: r.ruleType, perUnitAmount: r.perUnitAmount };
    case "SLAB":
      return { ruleType: r.ruleType, slabs: r.slabs, slabApplication: r.slabApplication };
    case "TARGET_BONUS":
      return { ruleType: r.ruleType, targetUnits: r.targetUnits, targetBonusAmount: r.targetBonusAmount };
    case "PERCENTAGE":
      return { ruleType: r.ruleType, percentageRate: r.percentageRate };
    case "TEAM_OVERRIDE":
      return { ruleType: r.ruleType, teamOverridePerUnit: r.teamOverridePerUnit };
    case "DEALER_RECRUITMENT":
      return { ruleType: r.ruleType, minRecruits: r.minRecruits, perRecruitAmount: r.perRecruitAmount, perDistributorAmount: r.perDistributorAmount, countSubDealers: r.countSubDealers };
    case "TARGET_COMMISSION":
      return { ruleType: r.ruleType, perUnitAmount: r.perUnitAmount, targetUnits: r.targetUnits, targetPayout: r.targetPayout };
  }
}

/** Same rule in paise, for the live preview through the real engine. */
function inPaise(r: RuleDraft): any {
  const p: any = payload(r);
  for (const k of ["perUnitAmount", "targetBonusAmount", "teamOverridePerUnit", "perRecruitAmount", "perDistributorAmount"]) if (p[k] !== undefined) p[k] = rupeesToPaise(p[k]);
  if (p.slabs) p.slabs = p.slabs.map((s: any) => ({ ...s, amountPerUnit: rupeesToPaise(s.amountPerUnit) }));
  return p;
}

const num = (v: string) => (v === "" ? 0 : Number(v));

export default function SchemeBuilderPage() {
  const router = useRouter();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState(ymd(monthStart));
  const [validTo, setValidTo] = useState(ymd(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)));
  const [applicableRoles, setApplicableRoles] = useState<string[]>(["FEC"]);
  const [rules, setRules] = useState<RuleDraft[]>([blank("SLAB")]);
  const [picker, setPicker] = useState(false);

  // Live simulator
  const [simUnits, setSimUnits] = useState(8);
  const [simRecruits, setSimRecruits] = useState(5);
  const [simTarget, setSimTarget] = useState(10);
  const [simTeam, setSimTeam] = useState(20);
  const [loading, setLoading] = useState(false);

  const update = (i: number, patch: Partial<RuleDraft>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const useFseTemplate = () => {
    setName("FSE dealer recruitment + target commission");
    setDescription("Commission per dealer appointed (minimum 5 in the month) and per vehicle sold against the monthly target");
    setApplicableRoles(["FEC"]);
    setRules([blank("DEALER_RECRUITMENT"), blank("TARGET_COMMISSION")]);
  };

  const hasTeam = rules.some((r) => r.ruleType === "TEAM_OVERRIDE");
  const preview = useMemo(() => {
    const start = new Date(monthStart);
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59);
    const sale = (i: number, soldBy: string) => ({
      _id: `${soldBy}${i}`,
      saleCode: `${soldBy}${i}`,
      saleDate: new Date(start.getTime() + (i % 25) * 86400000 + 3600000),
      soldBy,
      asmAtSale: "me",
      modelId: "m",
      exShowroom: 8500000, // ₹85,000 a vehicle
      totalAmount: 8925000,
      status: "DELIVERED" as const,
    });
    const sales = [...Array.from({ length: simUnits }, (_, i) => sale(i, "me")), ...(hasTeam ? Array.from({ length: simTeam }, (_, i) => sale(i, "team")) : [])];
    const scheme = { _id: "sim", name: "sim", status: "ACTIVE", validFrom: start, validTo: end, applicableRoles: [], rules: rules.map(inPaise) };
    const out = computeIncentives({ _id: "me", employeeCode: "SIM", name: "Sim", role: hasTeam ? "ASM" : "FEC" }, sales, [scheme], start, end, {
      recruits: { dealers: simRecruits, subDealers: 0, distributors: 0, codes: [] },
      monthTargetUnits: simTarget,
    });
    return out.schemes[0]?.rulesBreakdown || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, simUnits, simRecruits, simTarget, simTeam, hasTeam]);
  const previewTotal = preview.reduce((t, r) => t + r.earnedAmount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || applicableRoles.length === 0) {
      alert("Enter the scheme name and choose at least one role");
      return;
    }
    if (!rules.length) {
      alert("Add at least one rule");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, validFrom, validTo, applicableRoles, rules: rules.map(payload) }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to create scheme");
        setLoading(false);
        return;
      }
      router.push("/schemes");
      router.refresh();
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  };

  const money = (i: number, k: keyof RuleDraft, label: string, hint?: string) => (
    <div>
      <Label>{label}</Label>
      <Input type="number" min={0} value={rules[i][k] as number} onChange={(e) => update(i, { [k]: num(e.target.value) } as any)} className="mt-1" />
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/schemes">
          <Button variant="outline" size="icon" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-slate-900">Incentive scheme builder</h1>
          <p className="text-xs text-slate-500">Combine any rules in one scheme. It starts as a draft and pays only after Business Head and Managing Partner approval.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={useFseTemplate}>
          <Wand2 className="h-4 w-4" /> FSE recruitment + target template
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Scheme profile and validity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Scheme name *</Label>
                <Input required placeholder="e.g. FSE monthly scheme" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Description / objective</Label>
                <Input placeholder="e.g. Grow the dealer network" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valid from *</Label>
                <Input type="date" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Valid to *</Label>
                <Input type="date" required value={validTo} onChange={(e) => setValidTo(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Applicable roles *</Label>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setApplicableRoles((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                      applicableRoles.includes(r) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    {ROLE_SHORT[r] || r}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {rules.map((r, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm">
                Rule {i + 1}: {LABEL[r.ruleType]}
              </CardTitle>
              <button type="button" className="rounded p-1 text-red-500 hover:text-red-700" aria-label={`Remove rule ${i + 1}`} onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent>
              {r.ruleType === "DEALER_RECRUITMENT" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Minimum partners to appoint in the month</Label>
                    <Input type="number" min={0} value={r.minRecruits} onChange={(e) => update(i, { minRecruits: num(e.target.value) })} className="mt-1" />
                    <p className="mt-1 text-[11px] text-slate-500">Below this, nothing is paid. At or above it, every partner appointed is paid.</p>
                  </div>
                  {money(i, "perRecruitAmount", "Commission per dealer appointed (₹)")}
                  {money(i, "perDistributorAmount", "Commission per distributor appointed (₹)", "0 = distributors do not count")}
                  <label className="flex items-center gap-2 self-center text-xs text-slate-700">
                    <input type="checkbox" checked={r.countSubDealers} onChange={(e) => update(i, { countSubDealers: e.target.checked })} />
                    Sub dealers count as dealers
                  </label>
                  <p className="text-[11px] text-slate-500 sm:col-span-2">
                    A partner counts in the month it is onboarded, once it is active (KYC verified). Set “Appointed by” when onboarding the dealer.
                  </p>
                </div>
              )}

              {r.ruleType === "TARGET_COMMISSION" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {money(i, "perUnitAmount", "Commission per vehicle sold (₹)")}
                  <div>
                    <Label>Default monthly target (units)</Label>
                    <Input type="number" min={0} value={r.targetUnits} onChange={(e) => update(i, { targetUnits: num(e.target.value) })} className="mt-1" />
                    <p className="mt-1 text-[11px] text-slate-500">Used when no personal target is set on the Targets page.</p>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-700 sm:col-span-2">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={r.targetPayout === "ALL_WHEN_MET"} onChange={() => update(i, { targetPayout: "ALL_WHEN_MET" })} />
                      Pay on every vehicle sold once the target is met (nothing below target)
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={r.targetPayout === "ABOVE_TARGET"} onChange={() => update(i, { targetPayout: "ABOVE_TARGET" })} />
                      Pay only on vehicles sold above the target
                    </label>
                  </div>
                </div>
              )}

              {r.ruleType === "PER_UNIT" && <div className="sm:w-64">{money(i, "perUnitAmount", "Incentive per unit sold (₹)")}</div>}

              {r.ruleType === "SLAB" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={r.slabApplication === "ALL_UNITS"} onChange={() => update(i, { slabApplication: "ALL_UNITS" })} />
                      All units get the reached slab rate
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" checked={r.slabApplication === "INCREMENTAL"} onChange={() => update(i, { slabApplication: "INCREMENTAL" })} />
                      Incremental per slab
                    </label>
                  </div>
                  {r.slabs.map((s, k) => {
                    const setSlab = (patch: any) => update(i, { slabs: r.slabs.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                    return (
                      <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                        <span className="w-14 font-semibold text-slate-700">Tier {k + 1}</span>
                        <span>From</span>
                        <Input type="number" min={1} value={s.minUnits} onChange={(e) => setSlab({ minUnits: num(e.target.value) })} className="h-8 w-16 text-xs" />
                        <span>to</span>
                        <Input type="number" placeholder="∞" value={s.maxUnits ?? ""} onChange={(e) => setSlab({ maxUnits: e.target.value === "" ? null : num(e.target.value) })} className="h-8 w-16 text-xs" />
                        <span className="ml-auto font-semibold">₹</span>
                        <Input type="number" value={s.amountPerUnit} onChange={(e) => setSlab({ amountPerUnit: num(e.target.value) })} className="h-8 w-24 text-xs font-bold" />
                        <span className="text-slate-500">/unit</span>
                        {r.slabs.length > 1 && (
                          <button type="button" aria-label="Remove tier" onClick={() => update(i, { slabs: r.slabs.filter((_, j) => j !== k) })} className="p-1 text-red-500 hover:text-red-700">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const last = r.slabs[r.slabs.length - 1];
                      const min = last ? (last.maxUnits ? last.maxUnits + 1 : last.minUnits + 5) : 1;
                      update(i, { slabs: [...r.slabs, { minUnits: min, maxUnits: null, amountPerUnit: 1500 }] });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add tier
                  </Button>
                </div>
              )}

              {r.ruleType === "TARGET_BONUS" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Target (units)</Label>
                    <Input type="number" min={1} value={r.targetUnits} onChange={(e) => update(i, { targetUnits: num(e.target.value) })} className="mt-1" />
                  </div>
                  {money(i, "targetBonusAmount", "Lump-sum bonus (₹)")}
                </div>
              )}

              {r.ruleType === "PERCENTAGE" && (
                <div className="sm:w-64">
                  <Label>Commission on ex-showroom value (%)</Label>
                  <Input type="number" step="0.1" min={0} max={15} value={r.percentageRate} onChange={(e) => update(i, { percentageRate: num(e.target.value) })} className="mt-1" />
                </div>
              )}

              {r.ruleType === "TEAM_OVERRIDE" && (
                <div className="sm:w-80">{money(i, "teamOverridePerUnit", "Override per team vehicle sold (₹)", "Paid to the ASM for each vehicle delivered by their FSE team.")}</div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="pt-5">
            {!picker ? (
              <Button type="button" variant="outline" onClick={() => setPicker(true)}>
                <Plus className="h-4 w-4" /> Add a rule
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RULE_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      setRules((rs) => [...rs, blank(t.type)]);
                      setPicker(false);
                    }}
                    className="rounded-lg border border-slate-200 bg-white p-3 text-left transition-all hover:border-brand-400"
                  >
                    <p className="text-xs font-bold text-slate-800">{t.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{t.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-brand-500/50 bg-gradient-to-br from-brand-50/50 to-teal-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-brand-800">
              <Sparkles className="h-4 w-4 text-brand-600" /> Live payout preview (same calculation as payroll)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Vehicles sold in the month", simUnits, setSimUnits, 40],
                ["Monthly target (units)", simTarget, setSimTarget, 40],
                ["Dealers appointed in the month", simRecruits, setSimRecruits, 20],
                ...(hasTeam ? [["Team vehicles (for ASM override)", simTeam, setSimTeam, 100]] : []),
              ].map(([label, v, set, max]: any) => (
                <div key={label}>
                  <Label>{label}</Label>
                  <div className="mt-1 flex items-center gap-3">
                    <input type="range" min={0} max={max} value={v} onChange={(e) => set(Number(e.target.value))} className="w-full cursor-pointer accent-brand-600" aria-label={label} />
                    <span className="w-10 text-right text-sm font-bold text-slate-800">{v}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-brand-100 rounded-lg border border-brand-200 bg-white text-sm shadow-sm">
              {preview.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{LABEL[p.ruleType as RuleType] || p.ruleType}</span> — {p.description}
                  </span>
                  <span className="shrink-0 font-semibold tabular">{formatINR(p.earnedAmount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-slate-500">Total for the month (₹85,000 a vehicle assumed)</span>
                <span className="text-2xl font-black text-brand-600">{formatINR(previewTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/schemes">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={loading} className="min-w-36 bg-brand-600 text-white hover:bg-brand-500">
            {loading ? "Saving…" : "Save scheme as draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}
