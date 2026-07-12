import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const nome = String(body.nome || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 422 });
  }
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome do usuario." }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    mode: "mock",
    user: { id: crypto.randomUUID(), email, nome, ativo: true }
  });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id || "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Informe o usuario." }, { status: 422 });
  }
  return NextResponse.json({ ok: true, active: false });
}
