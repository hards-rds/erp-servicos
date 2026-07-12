import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 422 });
  }

  return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
}
