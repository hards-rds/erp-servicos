# Autorizacao e isolamento

## Regra das APIs

Toda API de negocio deve validar, nesta ordem:

1. sessao autenticada;
2. perfil ativo com tenant e empresa selecionados;
3. empresa ativa pertencente ao tenant do perfil;
4. segmento, quando o modulo for especializado;
5. permissao de modulo e acao via `app_has_permission`;
6. `company_id` em toda leitura ou mutacao de entidade operacional.

O helper `requireCompanyPermission` concentra os cinco primeiros itens. O RLS do Supabase e o filtro explicito de `company_id` formam uma protecao em duas camadas para o sexto.

## Rotas publicas controladas

- login, logout e troca de senha;
- health check sem dados internos;
- webhook do Banco Inter, validado pela credencial da cobranca.

Novas excecoes devem ser justificadas e adicionadas ao teste `api-authorization.test.ts`.

## Auditoria

Operacoes sensiveis registram empresa, ator, entidade, acao e metadados nao secretos em `audit_logs`. Nunca devem ser gravados tokens, senhas, certificados, XML completo, payload fiscal completo ou dados bancarios sensiveis.

## Ordem de liberacao

1. aplicar `20260829120000_commercial_authorization.sql`;
2. confirmar grupos e permissoes dos tenants existentes;
3. publicar a aplicacao;
4. executar smoke tests com perfis Master, Financeiro, Fiscal, Cadastros e Operacao;
5. conferir o painel Admin > Saude do sistema.
