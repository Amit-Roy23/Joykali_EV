"use client";

import { useParams } from "next/navigation";
import { DistributorDetail } from "@/components/distributorDetail";

export default function DistributorPage() {
  const { id } = useParams<{ id: string }>();
  return <DistributorDetail id={id} />;
}
