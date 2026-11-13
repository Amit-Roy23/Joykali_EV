"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BrandLogo, BrandMark } from "@/components/layout/BrandMark";
import { RoleBadge } from "@/components/ui/kit";
import { cn } from "@/components/ui/button";

/**
 * Demo accounts are only listed when NEXT_PUBLIC_DEMO_MODE=true. They simply
 * pre-fill the normal login form — there is no bypass on the server.
 */
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_PASSWORD = "Joykali@123";
const DEMO_ACCOUNTS = [
  { role: "ADMIN", name: "Rajib Chakraborty", login: "admin@joykaliev.in", blurb: "Users, roles, settings, audit trail" },
  { role: "MANAGING_PARTNER", name: "Joydeb Kali Sarkar", login: "mp@joykaliev.in", blurb: "Final approver — orders, payroll, credit" },
  { role: "BUSINESS_HEAD", name: "Ananya Bhattacharya", login: "bh@joykaliev.in", blurb: "First approver; warehouse & dispatch" },
  { role: "ASM", name: "Moumita Banerjee", login: "asm.kolkata@joykaliev.in", blurb: "Kolkata team & leaderboard" },
  { role: "FEC", name: "Arnab Chatterjee", login: "fec5@joykaliev.in", blurb: "Books sales, tracks incentives" },
  { role: "DISTRIBUTOR", name: "Bardhaman Auto Distributors", login: "dist1@joykaliev.in", blurb: "Places orders, receives deliveries (GRN)" },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (id: string, pw: string, key = "form") => {
    setLoading(key);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id, password: pw }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Login failed. Please check your credentials.");
        setLoading(null);
        return;
      }
      const from = new URLSearchParams(window.location.search).get("from");
      const next = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
      router.push(data.data?.mustChangePassword ? "/change-password" : next);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------- hero */}
      <section className="surface-ink relative overflow-hidden px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-white sm:px-10 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <BrandMark />

        <div className="mt-10 max-w-xl lg:mt-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-volt-300/30 bg-volt-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-volt-300">
            <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-volt-300" /> Dealer network · Live
          </p>
          <h1 className="mt-5 font-display text-[32px] font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Every sale, every dealer, <br className="hidden sm:block" />
            every rupee — <span className="bg-gradient-to-r from-volt-300 to-brand-300 bg-clip-text text-transparent">fully charged.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300 sm:text-base">
            One place for Joykali&apos;s vehicle stock, dealer allocations, field sales, incentive schemes and payroll —
            with the right view for every role from FEC to Admin.
          </p>

          {/* Signature visual: the "charge" stack */}
          <div className="mt-8 hidden max-w-md gap-3 sm:grid sm:grid-cols-3">
            {[
              { k: "Schemes → payouts", v: "Auto-synced" },
              { k: "Invoices", v: "GST-ready" },
              { k: "Payslips", v: "One click" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{s.k}</p>
                <p className="mt-1 font-display text-sm font-semibold text-white">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 hidden items-center gap-6 text-xs text-slate-400 lg:flex">
          <HierarchyStrip />
        </div>

        {/* decorative bolt */}
        <BrandLogo className="pointer-events-none absolute -right-16 -top-10 h-72 w-72 opacity-[0.07] sm:-right-10 lg:-bottom-16 lg:top-auto lg:h-[26rem] lg:w-[26rem]" />
      </section>

      {/* ---------------------------------------------------------- form */}
      <section className="relative -mt-6 rounded-t-[28px] bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:px-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your employee code (e.g. JKE-FEC-0001) or work email.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              signIn(identifier, password);
            }}
          >
            {error && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Employee code or email</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="identifier"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="JKE-FEC-0001"
                  className="h-11 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-700"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!!loading}>
              {loading === "form" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          {DEMO_MODE && (
            <div className="mt-8">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Explore the demo as</p>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="mt-4 grid gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.role}
                    disabled={!!loading}
                    onClick={() => {
                      setIdentifier(a.login);
                      setPassword(DEMO_PASSWORD);
                      signIn(a.login, DEMO_PASSWORD, a.role);
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-card transition",
                      "hover:border-brand-300 hover:shadow-lift disabled:opacity-60"
                    )}
                  >
                    <RoleBadge role={a.role} short className="w-16 justify-center py-1" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{a.name}</p>
                      <p className="truncate text-xs text-slate-500">{a.blurb}</p>
                    </div>
                    {loading === a.role ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-400">
                Demo password for every account: <span className="font-mono font-semibold text-slate-600">{DEMO_PASSWORD}</span>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HierarchyStrip() {
  const chain = ["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-slate-500">Access hierarchy</span>
      {chain.map((r, i) => (
        <React.Fragment key={r}>
          <RoleBadge role={r} short className="ring-white/10" />
          {i < chain.length - 1 && <span className="text-slate-600">‹</span>}
        </React.Fragment>
      ))}
    </div>
  );
}
