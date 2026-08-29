import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type MiddlewareCookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function middleware(request: NextRequest) {
  const suppliedRequestId = request.headers.get("x-request-id") || "";
  const requestId = /^[A-Za-z0-9._-]{8,128}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  const currentRequestHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);
    return headers;
  };
  const nextResponse = () => {
    const next = NextResponse.next({ request: { headers: currentRequestHeaders() } });
    next.headers.set("x-request-id", requestId);
    return next;
  };
  const redirectResponse = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("x-request-id", requestId);
    return redirect;
  };
  let response = nextResponse();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return redirectResponse(new URL("/login?error=config", request.url));
  }

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: MiddlewareCookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return redirectResponse(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/cadastros/:path*",
    "/operacao/:path*",
    "/financeiro/:path*",
    "/fiscal/:path*",
    "/relatorios/:path*",
    "/configuracoes/:path*",
    "/notificacoes/:path*"
  ]
};
