"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Calculator, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { calculateSlabIncentive } from "@/services/incentiveEngine";
import { formatINR, rupeesToPaise } from "@/lib/money";

export default function SchemeBuilderPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [validFrom, setValidFrom] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0]
  );
  const [validTo, setValidTo] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      .toISOString()
      .split("T")[0]
  );

  const [applicableRoles, setApplicableRoles] = useState<string[]>(["FEC"]);
  const [ruleType, setRuleType] = useState<
    "PER_UNIT" | "SLAB" | "TARGET_BONUS" | "PERCENTAGE" | "TEAM_OVERRIDE"
  >("SLAB");

  // Rule parameters
  const [perUnitAmount, setPerUnitAmount] = useState(1000);
  const [slabs, setSlabs] = useState([
    { minUnits: 1, maxUnits: 5, amountPerUnit: 500 },
    { minUnits: 6, maxUnits: 10, amountPerUnit: 800 },
    { minUnits: 11, maxUnits: null as number | null, amountPerUnit: 1200 },
  ]);
  const [slabApplication, setSlabApplication] = useState<"ALL_UNITS" | "INCREMENTAL">("ALL_UNITS");

  const [targetUnits, setTargetUnits] = useState(15);
  const [targetBonusAmount, setTargetBonusAmount] = useState(10000);

  const [percentageRate, setPercentageRate] = useState(1.5);
  const [teamOverridePerUnit, setTeamOverridePerUnit] = useState(300);

  // Live Simulator State
  const [simUnits, setSimUnits] = useState(8);
  const [loading, setLoading] = useState(false);

  // Calculate live preview earning based on active rule
  let previewEarnedPaise = 0;
  if (ruleType === "PER_UNIT") {
    previewEarnedPaise = simUnits * rupeesToPaise(perUnitAmount);
  } else if (ruleType === "SLAB") {
    const formattedSlabs = slabs.map((s) => ({
      minUnits: s.minUnits,
      maxUnits: s.maxUnits,
      amountPerUnit: rupeesToPaise(s.amountPerUnit),
    }));
    const res = calculateSlabIncentive(formattedSlabs, simUnits, slabApplication);
    previewEarnedPaise = res.earned;
  } else if (ruleType === "TARGET_BONUS") {
    previewEarnedPaise = simUnits >= targetUnits ? rupeesToPaise(targetBonusAmount) : 0;
  } else if (ruleType === "PERCENTAGE") {
    const assumedExShowroom = simUnits * 8500000; // assumed ₹85,000 per unit in paise
    previewEarnedPaise = Math.round(assumedExShowroom * (percentageRate / 100));
  } else if (ruleType === "TEAM_OVERRIDE") {
    previewEarnedPaise = simUnits * rupeesToPaise(teamOverridePerUnit);
  }

  const handleRoleToggle = (role: string) => {
    setApplicableRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleAddSlab = () => {
    const last = slabs[slabs.length - 1];
    const newMin = last ? (last.maxUnits ? last.maxUnits + 1 : last.minUnits + 5) : 1;
    setSlabs([...slabs, { minUnits: newMin, maxUnits: null, amountPerUnit: 1500 }]);
  };

  const handleRemoveSlab = (idx: number) => {
    setSlabs(slabs.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || applicableRoles.length === 0) {
      alert("Please enter scheme name and select at least one applicable role");
      return;
    }

    setLoading(true);

    const rulesPayload: any[] = [];
    if (ruleType === "PER_UNIT") {
      rulesPayload.push({ ruleType, perUnitAmount });
    } else if (ruleType === "SLAB") {
      rulesPayload.push({ ruleType, slabs, slabApplication });
    } else if (ruleType === "TARGET_BONUS") {
      rulesPayload.push({ ruleType, targetUnits, targetBonusAmount });
    } else if (ruleType === "PERCENTAGE") {
      rulesPayload.push({ ruleType, percentageRate });
    } else if (ruleType === "TEAM_OVERRIDE") {
      rulesPayload.push({ ruleType, teamOverridePerUnit });
    }

    try {
      const res = await fetch("/api/schemes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          validFrom,
          validTo,
          applicableRoles,
          rules: rulesPayload,
        }),
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/schemes">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Incentive Scheme Builder</h1>
          <p className="text-xs text-slate-500">
            Design targeted rules and preview payout projections in real-time
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Scheme Info */}
        <Card>
          <CardHeader>
            <CardTitle>Scheme Profile & Validity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Scheme Name *</Label>
                <Input
                  required
                  placeholder="e.g. Monthly High-Voltage Slab Scheme"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Description / Objective</Label>
                <Input
                  placeholder="e.g. Accelerate 2-wheeler sales volume"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valid From *</Label>
                <Input
                  type="date"
                  required
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Valid To *</Label>
                <Input
                  type="date"
                  required
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Applicable Roles *</Label>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRoleToggle(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      applicableRoles.includes(r)
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-700 border-slate-300 hover:border-slate-400"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rule Type Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Choose Incentive Rule Model</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { type: "SLAB", label: "Slab Tiers", desc: "Tiered by units" },
                { type: "PER_UNIT", label: "Per-Unit", desc: "Fixed ₹ / vehicle" },
                { type: "TARGET_BONUS", label: "Target Bonus", desc: "Hit unit threshold" },
                { type: "PERCENTAGE", label: "Commission %", desc: "% of ex-showroom" },
                { type: "TEAM_OVERRIDE", label: "Team Override", desc: "For Area Managers" },
              ].map((item) => (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setRuleType(item.type as any)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    ruleType === item.type
                      ? "bg-emerald-50 border-emerald-500 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <p
                    className={`text-xs font-bold ${
                      ruleType === item.type ? "text-emerald-800" : "text-slate-800"
                    }`}
                  >
                    {item.label}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                </button>
              ))}
            </div>

            {/* Rule Specific Inputs */}
            <div className="pt-4 border-t border-slate-100">
              {ruleType === "PER_UNIT" && (
                <div>
                  <Label>Incentive Amount Per Unit Sold (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={perUnitAmount}
                    onChange={(e) => setPerUnitAmount(Number(e.target.value))}
                    className="mt-1 w-64"
                  />
                </div>
              )}

              {ruleType === "SLAB" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Configure Volume Slabs</Label>
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="slabApp"
                          checked={slabApplication === "ALL_UNITS"}
                          onChange={() => setSlabApplication("ALL_UNITS")}
                        />
                        All units get reached slab rate
                      </label>
                      <label className="text-xs text-slate-600 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="slabApp"
                          checked={slabApplication === "INCREMENTAL"}
                          onChange={() => setSlabApplication("INCREMENTAL")}
                        />
                        Incremental per slab
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {slabs.map((slab, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <span className="font-semibold text-slate-700 w-16">
                          Tier #{i + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <span>From</span>
                          <Input
                            type="number"
                            min={1}
                            value={slab.minUnits}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[i].minUnits = Number(e.target.value);
                              setSlabs(updated);
                            }}
                            className="w-16 h-8 text-xs"
                          />
                          <span>to</span>
                          <Input
                            type="number"
                            placeholder="∞"
                            value={slab.maxUnits === null ? "" : slab.maxUnits}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[i].maxUnits = e.target.value === "" ? null : Number(e.target.value);
                              setSlabs(updated);
                            }}
                            className="w-16 h-8 text-xs"
                          />
                          <span>units:</span>
                        </div>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="font-semibold">₹</span>
                          <Input
                            type="number"
                            value={slab.amountPerUnit}
                            onChange={(e) => {
                              const updated = [...slabs];
                              updated[i].amountPerUnit = Number(e.target.value);
                              setSlabs(updated);
                            }}
                            className="w-24 h-8 text-xs font-bold"
                          />
                          <span className="text-slate-500">/unit</span>
                          {slabs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSlab(i)}
                              className="text-red-500 hover:text-red-700 p-1 ml-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddSlab}
                    className="text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Tier
                  </Button>
                </div>
              )}

              {ruleType === "TARGET_BONUS" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Target Sales Volume (Units)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={targetUnits}
                      onChange={(e) => setTargetUnits(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Lump Sum Target Bonus (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={targetBonusAmount}
                      onChange={(e) => setTargetBonusAmount(Number(e.target.value))}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}

              {ruleType === "PERCENTAGE" && (
                <div>
                  <Label>Commission Percentage on Ex-Showroom Sale Value (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={15}
                    value={percentageRate}
                    onChange={(e) => setPercentageRate(Number(e.target.value))}
                    className="mt-1 w-64"
                  />
                </div>
              )}

              {ruleType === "TEAM_OVERRIDE" && (
                <div>
                  <Label>Override Rate Per Team Vehicle Sold (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={teamOverridePerUnit}
                    onChange={(e) => setTeamOverridePerUnit(Number(e.target.value))}
                    className="mt-1 w-64"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Credited to the Area Sales Manager for each vehicle delivered by their reporting FEC team.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Simulator Preview Card */}
        <Card className="border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-50/50 to-teal-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <Sparkles className="w-4 h-4 text-emerald-600" /> Live Simulation Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Simulate Units Delivered in Period:</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={simUnits}
                    onChange={(e) => setSimUnits(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                  <span className="font-bold text-sm text-slate-800 w-12 text-right">
                    {simUnits} units
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-white border border-emerald-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Projected Employee Incentive Payout:</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  If an employee sells <span className="font-bold text-slate-700">{simUnits} units</span>, they will earn:
                </p>
              </div>
              <div className="text-2xl font-black text-emerald-600">
                {formatINR(previewEarnedPaise)}
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
          <Button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-36"
          >
            {loading ? "Saving Scheme..." : "Save Scheme as Draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}

