# Arquitetura inicial

## Stack

- Next.js App Router com TypeScript estrito.
- Supabase/Postgres para dados, auth, RLS e storage.
- Vercel para deploy.
- Rotas Node/server-side para operacoes com segredos, certificados, NFS-e e Banco Inter.

## Dominios

- `clients`: validacoes cadastrais e CPF/CNPJ.
- `contracts`: contratos recorrentes e geracao idempotente.
- `finance`: entradas, saidas, fluxo de caixa e conciliacao.
- `fiscal`: NFS-e, status e validacoes previas.
- `billing`: cobrancas Banco Inter e webhooks idempotentes.
- `users`: RBAC por grupos e permissoes.
- `settings`: configuracoes sensiveis e mascaramento.

## Decisoes herdadas do projeto de referencia

- Perfis e grupos sao tratados como autorizacao de negocio, alem da autenticacao.
- Service role fica apenas no servidor.
- APIs de emissao fiscal retornam mensagens normalizadas, sem stack trace.
- Certificados, tokens e senhas nao aparecem em logs nem no client-side.
