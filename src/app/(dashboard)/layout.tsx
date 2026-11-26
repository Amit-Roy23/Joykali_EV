import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { permissionsForUser } from "@/lib/grants";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await connectToDatabase();
  const permissions = await permissionsForUser({ userId: String((user as any).userId || (user as any)._id), role: user.role });

  return (
    <AppShell user={user} permissions={permissions}>
      {children}
    </AppShell>
  );
}
