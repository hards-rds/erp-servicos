# Planos e assinaturas

## Separacao financeira

As faturas da plataforma ficam em `saas_invoices` e nunca sao copiadas para `financial_entries`, `payables` ou fluxo de caixa das empresas. O Banco Inter configurado por uma empresa continua atendendo apenas as cobrancas operacionais daquele tenant.

## Planos

| Recurso | Starter | Pro | Enterprise |
| --- | ---: | ---: | ---: |
| Empresas | 1 | 3 | Sem limite |
| Usuarios ativos | 5 | 20 | Sem limite |
| Clientes | 1.000 | 20.000 | Sem limite |
| Produtos e servicos | 500 | 5.000 | Sem limite |
| Contratos e matriculas | 100 | 2.000 | Sem limite |
| NFS-e, relatorios e importacoes | Sim | Sim | Sim |
| Automacoes recorrentes | Nao | Sim | Sim |
| Integracoes com APIs | Nao | Sim | Sim |

Os limites bloqueiam apenas novos registros. Dados existentes continuam disponiveis para consulta, edicao e exportacao. A validacao ocorre antes da gravacao na aplicacao e novamente no banco, com bloqueio transacional para evitar ultrapassagem por requisicoes simultaneas.

## Operacao

- O cliente consulta consumo, recursos e faturas em `Configuracoes > Assinatura e plano`.
- O `system_admin` gerencia plano, status, ciclo, periodo e faturas em `Admin > Tenants > Gerenciar assinatura`.
- Alteracoes de plano e faturas geram auditoria.
- O processamento automatico global considera apenas tenants Pro ou Enterprise ativos ou em teste.
- NFS-e continua disponivel em todos os planos e sempre exige conferencia do operador antes da transmissao.

## Migracao

Aplicar `supabase/migrations/20260829150000_saas_plans_and_subscriptions.sql` depois das migrations comerciais anteriores. A migration cria o catalogo dos planos, provisiona uma assinatura para cada tenant existente, configura RLS e instala os limites no banco.
