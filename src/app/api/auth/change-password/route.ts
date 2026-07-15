import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function redirectWithStatus(request: Request, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/usuarios?password=${status}`, request.url), { status: 303 });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") || "");
  const newPassword = String(form.get("newPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return redirectWithStatus(request, "missing");
  }
  if (newPassword.length < 8) {
    return redirectWithStatus(request, "short");
  }
  if (newPassword !== confirmPassword) {
    return redirectWithStatus(request, "mismatch");
  }

  const response = NextResponse.redirect(new URL("/configuracoes/usuarios?password=changed", request.url), { status: 303 });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return redirectWithStatus(request, "config");
  }

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.headers
          .get("cookie")
          ?.split(";")
          .map((cookie) => {
            const [name, ...value] = cookie.trim().split("=");
            return { name, value: value.join("=") };
          })
          .filter((cookie) => cookie.name) ?? [];
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });
  if (signInError) {
    return redirectWithStatus(request, "current");
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return redirectWithStatus(request, "failed");
  }

  return response;
}
