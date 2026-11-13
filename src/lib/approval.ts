import mongoose, { Schema } from "mongoose";
import { APPROVAL_CHAIN, ApprovalLevel, JWTPayload } from "@/types";

/**
 * Two-signature approval: every approvable record (order, incentive scheme,
 * payroll run, credit-limit change, salary revision) needs the Business Head
 * first and then the Managing Partner. A rejection by either ends it.
 * Admin can see everything but can never sign.
 */
export interface ApprovalSignature {
  level: ApprovalLevel;
  decision: "APPROVED" | "REJECTED";
  by: mongoose.Types.ObjectId | string;
  byName: string;
  byCode: string;
  at: Date;
  note?: string;
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export const ApprovalSignatureSchema = new Schema<ApprovalSignature>(
  {
    level: { type: String, enum: [...APPROVAL_CHAIN], required: true },
    decision: { type: String, enum: ["APPROVED", "REJECTED"], required: true },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String, required: true },
    byCode: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
    note: { type: String },
  },
  { _id: false }
);

export class ApprovalError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export const LEVEL_LABEL: Record<ApprovalLevel, string> = {
  BUSINESS_HEAD: "Business Head",
  MANAGING_PARTNER: "Managing Partner",
};

export function approvalState(signatures: ApprovalSignature[] | undefined | null): {
  status: ApprovalStatus;
  next: ApprovalLevel | null;
  signed: ApprovalSignature[];
} {
  const signed = [...(signatures || [])];
  if (signed.some((s) => s.decision === "REJECTED")) return { status: "REJECTED", next: null, signed };
  for (const level of APPROVAL_CHAIN) {
    if (!signed.some((s) => s.level === level && s.decision === "APPROVED")) {
      return { status: "PENDING", next: level, signed };
    }
  }
  return { status: "APPROVED", next: null, signed };
}

/**
 * Validate and record one signature. Returns the new signature list and the
 * resulting state. Pure: callers persist the result.
 */
export function sign(
  signatures: ApprovalSignature[] | undefined | null,
  user: Pick<JWTPayload, "userId" | "role" | "name" | "employeeCode">,
  decision: "APPROVED" | "REJECTED",
  note?: string
): { signatures: ApprovalSignature[]; status: ApprovalStatus; next: ApprovalLevel | null; final: boolean } {
  if (user.role === "ADMIN") {
    throw new ApprovalError("Admins cannot approve. Approval needs the Business Head and the Managing Partner.", 403);
  }
  if (!(APPROVAL_CHAIN as readonly string[]).includes(user.role)) {
    throw new ApprovalError("Only the Business Head and the Managing Partner can approve.", 403);
  }
  const state = approvalState(signatures);
  if (state.status !== "PENDING") {
    throw new ApprovalError(`Already ${state.status.toLowerCase()} — no further signatures needed.`);
  }
  const level = user.role as ApprovalLevel;
  if (state.next !== level) {
    if (level === "MANAGING_PARTNER") {
      throw new ApprovalError("Waiting for the Business Head to approve first.");
    }
    throw new ApprovalError("You have already signed this; it is waiting for the Managing Partner.");
  }
  if (state.signed.some((s) => String(s.by) === String(user.userId))) {
    throw new ApprovalError("The same person cannot sign twice.");
  }
  if (decision === "REJECTED" && !note?.trim()) {
    throw new ApprovalError("A reason is required to reject.", 400);
  }
  const signature: ApprovalSignature = {
    level,
    decision,
    by: new mongoose.Types.ObjectId(user.userId),
    byName: user.name,
    byCode: user.employeeCode,
    at: new Date(),
    note: note?.trim() || undefined,
  };
  const next = [...state.signed, signature];
  const after = approvalState(next);
  return { signatures: next, status: after.status, next: after.next, final: after.status !== "PENDING" };
}

/** Human-readable "who still has to sign". */
export function waitingFor(signatures: ApprovalSignature[] | undefined | null): string | null {
  const s = approvalState(signatures);
  return s.next ? LEVEL_LABEL[s.next] : null;
}
