import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Require JWT_SECRET — fail hard if missing
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW) {
  throw new Error(
    "FATAL: JWT_SECRET environment variable is required. " +
    "Set it in your .env file. See .env.example for details."
  );
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const PUBLIC_ROUTES = ["/login", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api");

  // Allow public routes (login, health check)
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("bik-prestige-token")?.value;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = payload.role as string;

    // Role-based page route guards (not applied to API routes — API routes do their own checks)
    if (!isApi) {
      if (role === "admin") {
        if (pathname.startsWith("/worker") || pathname.startsWith("/collector")) {
          return NextResponse.redirect(new URL("/admin/dashboard", request.url));
        }
      }

      if (role === "worker") {
        if (pathname.startsWith("/admin") || pathname.startsWith("/collector") || pathname.startsWith("/susu")) {
          return NextResponse.redirect(new URL("/worker/dashboard", request.url));
        }
      }

      if (role === "collector") {
        if (pathname.startsWith("/admin") || pathname.startsWith("/worker") || pathname.startsWith("/susu/admin")) {
          return NextResponse.redirect(new URL("/collector/dashboard", request.url));
        }
      }

      if (pathname === "/") {
        return NextResponse.redirect(
          new URL(role === "admin" ? "/admin/dashboard" : "/worker/dashboard", request.url)
        );
      }
    }

    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
