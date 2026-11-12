"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Login failed. Please check credentials.");
        setLoading(false);
        return;
      }

      if (data.data?.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
      setLoading(false);
    }
  };

  const fillTestCredentials = (id: string, pass: string) => {
    setIdentifier(id);
    setPassword(pass);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="mx-auto w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/25 mb-4">
          <Zap className="w-8 h-8 fill-current" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Joykali EV Mobility
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Electric Vehicle Dealership & Enterprise Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <Label className="text-slate-300">Employee Code or Email</Label>
              <div className="mt-1.5 relative">
                <Input
                  type="text"
                  required
                  placeholder="e.g. admin@joykali.com or JKE-ADM-0001"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 pl-3 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Password</Label>
              <div className="mt-1.5 relative">
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 pl-3 focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 h-auto text-sm transition-all"
            >
              {loading ? "Authenticating..." : "Sign In to Portal"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </Button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
              Quick Demo Accounts
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => fillTestCredentials("admin@joykali.com", "Admin@123")}
                className="p-2 rounded bg-slate-950/70 border border-slate-800 hover:border-emerald-600 text-slate-300 text-left transition-colors"
              >
                <span className="font-semibold text-white block">👑 Admin</span>
                admin@joykali.com
              </button>
              <button
                type="button"
                onClick={() => fillTestCredentials("mp@joykali.com", "Admin@123")}
                className="p-2 rounded bg-slate-950/70 border border-slate-800 hover:border-emerald-600 text-slate-300 text-left transition-colors"
              >
                <span className="font-semibold text-white block">💼 Partner</span>
                mp@joykali.com
              </button>
              <button
                type="button"
                onClick={() => fillTestCredentials("asm1@joykali.com", "Admin@123")}
                className="p-2 rounded bg-slate-950/70 border border-slate-800 hover:border-emerald-600 text-slate-300 text-left transition-colors"
              >
                <span className="font-semibold text-white block">📈 ASM</span>
                asm1@joykali.com
              </button>
              <button
                type="button"
                onClick={() => fillTestCredentials("fec1@joykali.com", "Admin@123")}
                className="p-2 rounded bg-slate-950/70 border border-slate-800 hover:border-emerald-600 text-slate-300 text-left transition-colors"
              >
                <span className="font-semibold text-white block">🛵 FEC (Sales)</span>
                fec1@joykali.com
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

