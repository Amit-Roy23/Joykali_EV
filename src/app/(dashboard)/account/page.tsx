"use client";

import React, { useEffect, useState } from "react";
import { DistributorDetail } from "@/components/distributorDetail";
import { PageSkeleton } from "@/components/ui/kit";
import { api, Notice } from "@/components/workflow";

/** Distributor portal: their own credit, statement, orders and deliveries. */
export default function AccountPage() {
  const [distId, setDistId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/auth/me")
      .then((m) => {
        const d = m.user?.distributor;
        if (!d) throw new Error("Your login is not linked to a distributor");
        setDistId(String(d._id || d));
      })
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <Notice>{error}</Notice>;
  if (!distId) return <PageSkeleton />;
  return <DistributorDetail id={distId} portal />;
}
