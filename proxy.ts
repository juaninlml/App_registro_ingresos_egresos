import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/setup"];

/**
 * Revisión rápida de sesión antes de servir páginas y APIs. No es la única barrera:
 * cada ruta de /api/data, /api/export e /api/import vuelve a comprobar la sesión.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  let ok = false;
  try {
    ok = await verifySessionToken(request.cookies.get(COOKIE)?.value);
  } catch {
    ok = false;
  }
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)"],
};
