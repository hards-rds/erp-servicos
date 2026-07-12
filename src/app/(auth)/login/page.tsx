import { LockKeyhole } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-label="Mundo Livre tecnologia">
        <div className="brand-mark">
          <Image
            src="/assets/mundo-livre-shield.svg"
            alt="Mundo Livre tecnologia"
            className="shield-logo"
            width={320}
            height={320}
            priority
          />
        </div>
      </section>
      <section className="auth-panel" aria-label="Entrar">
        <div>
          <LockKeyhole color="var(--accent)" aria-hidden="true" />
          <h1>Entrar</h1>
          <p>Acesse o painel da sua empresa com seguranca.</p>
        </div>
        <form className="form-stack" action="/api/auth/login" method="post">
          <label>
            E-mail
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary-button" type="submit">Entrar</button>
          <button className="ghost-button" type="button">Recuperar senha</button>
        </form>
      </section>
    </main>
  );
}
