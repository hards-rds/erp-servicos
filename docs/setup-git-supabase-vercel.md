# Setup novo: Git, Supabase e Vercel

Este projeto deve ser conectado a recursos novos. Nao reutilize o projeto Supabase, Vercel ou remoto Git do painel de referencia.

## Git

O repositorio local ja foi inicializado com branch `main`.

Proximos comandos, quando o remoto novo existir:

```bash
git remote add origin <url-do-repositorio-novo>
git add .
git commit -m "chore: scaffold erp servicos"
git push -u origin main
```

## Supabase

Crie um projeto Supabase novo e linke manualmente:

```bash
supabase login
supabase link --project-ref <project-ref-novo>
supabase db push
```

Depois configure as variaveis:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

RLS ja foi habilitado na migration inicial. As policies finais devem ser revisadas antes de producao.

## Vercel

Crie um projeto Vercel novo apontando para o repositorio novo:

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add APP_URL
vercel env add APP_ENV
```

Variaveis fiscais, Banco Inter e e-mail devem ficar apenas nos ambientes corretos e nunca no client-side.

## Ambientes

- Desenvolvimento local: mocks e sandbox.
- Homologacao: Supabase novo, Inter sandbox, NFS-e homologacao.
- Producao: somente apos confirmacao explicita para chamadas reais fiscais/bancarias.
