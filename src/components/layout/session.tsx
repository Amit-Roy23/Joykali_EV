"use client";

import React, { createContext, useContext } from "react";

interface Session {
  user: any;
  permissions: string[];
  can: (permission: string) => boolean;
}

const SessionContext = createContext<Session>({ user: null, permissions: [], can: () => false });

export function SessionProvider({ user, permissions, children }: { user: any; permissions: string[]; children: React.ReactNode }) {
  const can = (p: string) => user?.role === "ADMIN" || permissions.includes(p);
  return <SessionContext.Provider value={{ user, permissions, can }}>{children}</SessionContext.Provider>;
}

/** Current user + permission check, for hiding actions the server would refuse anyway. */
export function useSession() {
  return useContext(SessionContext);
}
