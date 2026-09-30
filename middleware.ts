import { extractBearerToken, verifyAccessToken } from "@/auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/health"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  try {
    const token = extractBearerToken(request.headers.get("authorization"));
    await verifyAccessToken(token);
    return NextResponse.next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No autenticado.";
    const status =
      error instanceof Error && "status" in error && typeof error.status === "number"
        ? error.status
        : 401;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: status === 500 ? "INTERNAL_ERROR" : "UNAUTHORIZED",
          message,
        },
      },
      { status },
    );
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
