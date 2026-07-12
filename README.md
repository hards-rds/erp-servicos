# ERP de Gestao de Empresas de Servicos

Base inicial em Next.js, TypeScript e Supabase para um ERP focado em clientes recorrentes, contratos, financeiro, emissao fiscal, cobrancas bancarias e controle de acesso.

## O que ja existe

- Login escuro inspirado no projeto de referencia, sem mensagens tecnicas para o usuario final.
- Layout autenticado com sidebar recolhivel, header, breadcrumbs e navegacao por modulos.
- Telas iniciais para clientes, contratos, financeiro, fiscal e configuracoes.
- Dominios com regras testaveis para recorrencia, fluxo de caixa, CPF/CNPJ, permissoes, NFS-e e cobrancas.
- Rotas server-side preparadas para login, usuarios, NFS-e e Banco Inter, usando mocks/sandbox por padrao.
- Migration Supabase inicial com entidades centrais, RLS considerado e auditoria.

## Comandos

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

## Referencia inspecionada

Foi inspecionado localmente:

```text
/Users/lucasrocha/Documents/Codex/painel-faturas-mundo-livre-email-node
```

Padroes aproveitados: login escuro, sidebar por modulos, perfil de usuario, grupos de acesso, proxy server-side para Supabase/functions e cuidado para nao expor segredos no navegador.

## Seguranca

Nao versionar `.env`, certificados, dumps reais, tokens, senhas ou chaves privadas. Chamadas reais para NFS-e, Banco Inter ou producao precisam de autorizacao explicita.

## Git, Supabase e Vercel

Este e um projeto novo. A configuracao inicial esta em:

- `supabase/config.toml`
- `supabase/migrations/20260712090000_erp_servicos_base.sql`
- `vercel.json`
- `docs/setup-git-supabase-vercel.md`
