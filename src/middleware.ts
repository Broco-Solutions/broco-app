import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = ["/login", "/hours/activate", "/api/auth", "/_next", "/favicon.ico"];

function isMcpPath(pathname: string) {
  return (
    pathname === "/api/mcp" ||
    pathname === "/.well-known/oauth-protected-resource"
  );
}

function isPublicPortalPath(pathname: string) {
  return pathname === "/p" || pathname.startsWith("/p/");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRequest = pathname.startsWith("/api/");

  if (
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    isPublicPortalPath(pathname) ||
    isMcpPath(pathname)
  ) {
    return NextResponse.next();
  }

  const session = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  if (!session) {
    if (isApiRequest) {
      return NextResponse.json({ error: "Sesion expirada o no autenticada." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isRestrictedAdminPath = pathname === "/" || ["/clients", "/projects", "/incomes", "/expenses", "/users", "/hours/team", "/hours/reports"].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (session.role === "COLLABORATOR" && isRestrictedAdminPath) {
    return isApiRequest ? NextResponse.json({ error: "No autorizado." }, { status: 403 }) : NextResponse.redirect(new URL("/hours", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/"],
};
