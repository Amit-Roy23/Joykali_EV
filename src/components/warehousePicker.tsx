"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/components/workflow";

/** Select for company warehouses. Picks the user's own warehouse, else the main one, on load. */
export function WarehousePicker({ value, onChange, id = "warehouse", className = "field" }: { value: string; onChange: (id: string) => void; id?: string; className?: string }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    api<any>("/api/warehouses?simple=1")
      .then((r) => {
        setList(r.warehouses);
        if (!value && r.warehouses.length) onChange((r.warehouses.find((w: any) => r.mine.includes(String(w._id))) || r.warehouses[0])._id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (list.length <= 1) return list.length ? <p className="text-sm text-slate-600">{list[0].name}</p> : null;
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.map((w) => (
        <option key={w._id} value={w._id}>
          {w.name} · {w.city}
        </option>
      ))}
    </select>
  );
}
