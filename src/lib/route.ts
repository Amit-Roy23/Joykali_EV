import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, failure, jsonResponse } from "@/lib/apiHelper";
import { JWTPayload, Permission } from "@/types";

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (a: { req: NextRequest; user: JWTPayload; params: Record<string, string> }) => Promise<any>;

/** Route boilerplate: DB, auth (+ optional permission), JSON result, typed errors via `status`. */
export function handle(fn: Handler, permission?: Permission, fallback = "Request failed") {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      await connectToDatabase();
      const auth = await authenticateAndAuthorize(req, permission);
      if (auth.error) return auth.error;
      const out = await fn({ req, user: auth.user, params: (await ctx?.params) || {} });
      if (out instanceof NextResponse) return out;
      return jsonResponse(out, undefined, req.method === "POST" ? 201 : 200);
    } catch (e) {
      return failure(e, fallback);
    }
  };
}

/** Read a multipart file field into { name, type, data }. */
export async function fileFrom(form: FormData, key: string) {
  const f = form.get(key);
  if (f && typeof f === "object" && "arrayBuffer" in f && (f as File).size > 0) {
    const fl = f as File;
    return { name: fl.name, type: fl.type, data: Buffer.from(await fl.arrayBuffer()) };
  }
  return null;
}
