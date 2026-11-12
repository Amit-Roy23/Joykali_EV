"use client";

import React, { useEffect, useState } from "react";
import { Settings, Save, Building, ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setSettings(res.data);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update settings");
        setSaving(false);
        return;
      }

      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading settings...</div>;
  if (!settings) return <div className="p-6 text-red-600">Failed to load company profile.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Company Settings & Configuration</h1>
          <p className="text-xs text-slate-500">
            Business profile, GSTIN, code generation prefixes, and statutory deduction rates
          </p>
        </div>
        {savedSuccess && (
          <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-200 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Settings Saved!
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Company Legal Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Company Name *</Label>
                <Input
                  required
                  value={settings.companyName || ""}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Brand Tagline</Label>
                <Input
                  value={settings.brandTagline || ""}
                  onChange={(e) => setSettings({ ...settings, brandTagline: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>GSTIN *</Label>
                <Input
                  required
                  value={settings.gstin || ""}
                  onChange={(e) => setSettings({ ...settings, gstin: e.target.value })}
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label>PAN *</Label>
                <Input
                  required
                  value={settings.pan || ""}
                  onChange={(e) => setSettings({ ...settings, pan: e.target.value })}
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label>State Code (e.g. 19 for WB)</Label>
                <Input
                  value={settings.stateCode || "19"}
                  onChange={(e) => setSettings({ ...settings, stateCode: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Official Phone</Label>
                <Input
                  value={settings.phone || ""}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Official Email</Label>
                <Input
                  type="email"
                  value={settings.email || ""}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Head Office Address</Label>
              <Input
                value={settings.address || ""}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Statutory Deductions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Statutory Deduction Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Employee PF Rate (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={settings.statutoryDeductions?.pfRate ?? 12}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      statutoryDeductions: {
                        ...settings.statutoryDeductions,
                        pfRate: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Employee ESI Rate (%)</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={settings.statutoryDeductions?.esiRate ?? 0.75}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      statutoryDeductions: {
                        ...settings.statutoryDeductions,
                        esiRate: Number(e.target.value),
                      },
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Monthly Professional Tax (₹)</Label>
                <Input
                  type="number"
                  value={(settings.statutoryDeductions?.ptMonthlyPaise || 20000) / 100}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      statutoryDeductions: {
                        ...settings.statutoryDeductions,
                        ptMonthlyPaise: Number(e.target.value) * 100,
                      },
                    })
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-500 text-white min-w-36"
          >
            {saving ? "Saving Changes..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}

