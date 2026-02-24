import { NextRequest, NextResponse } from "next/server";

/**
 * Citatra - API Middleware
 *
 * All features are available in the open-source version.
 * This middleware is a pass-through.
 */

export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: "/api/workspaces/:path*",
};
