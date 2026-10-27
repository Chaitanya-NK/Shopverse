import { type NextRequest, NextResponse } from "next/server";

import { confirmEmailLink } from "@/features/auth/confirm";

/** GET /auth/confirm: target of the link in sign-in and sign-up emails. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const destination = await confirmEmailLink({
    tokenHash: params.get("token_hash"),
    type: params.get("type"),
    code: params.get("code"),
    next: params.get("next"),
  });

  return NextResponse.redirect(new URL(destination, request.url));
}
