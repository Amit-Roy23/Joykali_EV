"use client";
import React, { useEffect, useState } from "react";
import { api } from "@/components/workflow";

let cache: Promise<any[]> | null = null;
/** Active FSEs and ASMs — the people who can be credited with appointing a partner. */
function loadRecruiters() {
  if (!cache) {
    cache = Promise.all([
      api<any[]>("/api/employees?role=FEC&status=ACTIVE&limit=500").catch(() => []),
      api<any[]>("/api/employees?role=ASM&status=ACTIVE&limit=500").catch(() => []),
    ]).then(([f, a]) => [...a, ...f]);
    cache.catch(() => (cache = null));
  }
  return cache;
}

/**
 * "Appointed by" picker for dealer / distributor onboarding. The chosen FSE or ASM is
 * credited with the appointment for the dealer-recruitment incentive in the onboarding month.
 */
export function RecruiterSelect({ id = "recruited-by", value, onChange, className = "field" }: { id?: string; value: string; onChange: (v: string) => void; className?: string }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    loadRecruiters().then(setList);
  }, []);
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— not credited to anyone —</option>
      {list.map((u) => (
        <option key={u._id} value={u._id}>
          {u.name} ({u.employeeCode}) · {u.role === "FEC" ? "FSE" : u.role}
        </option>
      ))}
    </select>
  );
}
