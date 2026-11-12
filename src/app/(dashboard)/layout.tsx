import React from "react";
import { getCurrentUser } from "@/lib/auth";
import { getPermissionsForRole } from "@/lib/rbac";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const permissions = await getPermissionsForRole(user.role);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} permissions={permissions} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

