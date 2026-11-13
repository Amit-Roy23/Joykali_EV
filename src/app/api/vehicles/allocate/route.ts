import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/apiHelper";

/**
 * Retired. Stock now leaves the warehouse only through the controlled flow:
 * dealer order → BH + MP approval → warehouse Delivery Order → loading →
 * dispatch (challan + e-way bill) → dealer GRN. That flow enforces the
 * dealer's credit limit and fleet document checks.
 */
export async function POST(_req: NextRequest) {
  return errorResponse(
    "Direct allocation is retired. Raise a dealer order (Orders → New order); after Business Head and Managing Partner approval, the warehouse ships it on a Delivery Order.",
    410
  );
}
