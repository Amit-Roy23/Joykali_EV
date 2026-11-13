/**
 * Fleet document compliance (pure). A transport vehicle is LOCKED — it cannot
 * be loaded or dispatched — if any required document is missing or expired,
 * if it is inactive, or if someone placed a manual hold on it.
 */
export const DOC_LABEL: Record<string, string> = {
  RC: "Registration (RC)",
  INSURANCE: "Insurance",
  PUC: "Pollution (PUC)",
  FITNESS: "Fitness certificate",
  PERMIT: "Goods permit",
  ROAD_TAX: "Road tax",
};

/** Required documents. Electric vehicles are exempt from PUC. */
export function requiredDocs(fuel: string): string[] {
  const base = ["RC", "INSURANCE", "FITNESS", "PERMIT", "ROAD_TAX"];
  return fuel === "ELECTRIC" ? base : [...base, "PUC"];
}

export type DocState = "VALID" | "EXPIRING" | "EXPIRED" | "MISSING";

export interface FleetCompliance {
  locked: boolean;
  reasons: string[];
  expiringSoon: Array<{ type: string; validUpto: Date; daysLeft: number }>;
  docs: Array<{ type: string; label: string; required: boolean; state: DocState; validUpto: Date | null; daysLeft: number | null; number?: string }>;
}

const DAY = 86400000;

export function fleetCompliance(
  v: {
    fuel: string;
    status?: string;
    manualHold?: { reason: string } | null;
    documents?: Array<{ type: string; number?: string; validUpto?: Date | string | null }>;
  },
  asOf: Date = new Date(),
  warningDays = 15
): FleetCompliance {
  const reasons: string[] = [];
  const expiringSoon: FleetCompliance["expiringSoon"] = [];
  const required = new Set(requiredDocs(v.fuel));
  const types = [...new Set([...required, ...(v.documents || []).map((d) => d.type)])];

  const docs = types.map((type) => {
    // Latest validity wins when a document was renewed (several entries of one type).
    const entries = (v.documents || []).filter((d) => d.type === type);
    const best = entries.sort((a, b) => +new Date(b.validUpto || 8.64e15) - +new Date(a.validUpto || 8.64e15))[0];
    const isReq = required.has(type);
    let state: DocState = "MISSING";
    let validUpto: Date | null = null;
    let daysLeft: number | null = null;
    if (best) {
      validUpto = best.validUpto ? new Date(best.validUpto) : null;
      if (!validUpto) state = "VALID"; // lifetime validity
      else {
        // valid through the whole of its expiry day
        const end = validUpto.getTime() + DAY - 1;
        daysLeft = Math.floor((end - asOf.getTime()) / DAY);
        state = end < asOf.getTime() ? "EXPIRED" : daysLeft <= warningDays ? "EXPIRING" : "VALID";
      }
    }
    if (isReq && state === "MISSING") reasons.push(`${DOC_LABEL[type] || type} missing`);
    if (isReq && state === "EXPIRED") reasons.push(`${DOC_LABEL[type] || type} expired on ${validUpto!.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`);
    if (state === "EXPIRING" && validUpto) expiringSoon.push({ type, validUpto, daysLeft: daysLeft! });
    return { type, label: DOC_LABEL[type] || type, required: isReq, state, validUpto, daysLeft, number: best?.number };
  });

  if (v.status && v.status !== "ACTIVE") reasons.push("Vehicle is inactive");
  if (v.manualHold) reasons.push(`On hold: ${v.manualHold.reason}`);
  return { locked: reasons.length > 0, reasons, expiringSoon, docs };
}
