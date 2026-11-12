import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";
import { jsonResponse } from "@/lib/apiHelper";

export async function POST() {
  const res = jsonResponse({ message: "Successfully logged out" });
  clearAuthCookies(res);
  return res;
}

