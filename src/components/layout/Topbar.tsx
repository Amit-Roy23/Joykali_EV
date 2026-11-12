"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Bell, Shield, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Topbar({ user }: { user: any }) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      console.error(e);
      window.location.href = "/login";
    }
  };

  const roleColors: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
    MANAGING_PARTNER: "bg-indigo-100 text-indigo-800 border-indigo-200",
    BUSINESS_HEAD: "bg-blue-100 text-blue-800 border-blue-200",
    ASM: "bg-teal-100 text-teal-800 border-teal-200",
    FEC: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Joykali EV Mobility Portal
        </h2>
        <span className="text-slate-300">•</span>
        <span className="text-xs text-slate-500 font-medium">
          India Dealership Management System
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Role Badge */}
        {user?.role && (
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${roleColors[user.role] || "bg-slate-100 text-slate-800"}`}
          >
            {user.role.replace(/_/g, " ")}
          </span>
        )}

        {/* User Info */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-xs border border-slate-200">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="text-left hidden md:block">
            <p className="text-xs font-semibold text-slate-800 leading-none">
              {user?.name}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{user?.email}</p>
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}

