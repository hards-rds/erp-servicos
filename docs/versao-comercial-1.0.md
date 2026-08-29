# Versao Comercial 1.0

Este documento define o minimo necessario para vender e operar o ERP com seguranca. Uma versao so pode ser promovida para producao quando todos os bloqueadores estiverem atendidos.

## Posicionamento

O produto possui um nucleo comum de clientes, vendas, servicos, estoque, financeiro, usuarios e relatorios. Recursos especializados sao habilitados por segmento:

- Tecnologia: contratos recorrentes, chamados, PlanetChat, NFS-e e cobrancas.
- Otica: receitas, historico clinico, vendas, estoque e comissoes.
- Escola de futebol: atletas, responsaveis, turmas, matriculas, mensalidades e presencas.

## Bloqueadores de release

- [ ] `pnpm release:check` concluido sem falhas.
- [ ] Nenhuma migration pendente no Supabase de producao.
- [ ] Isolamento entre tenants validado por testes automatizados e teste manual.
- [ ] Perfis sem permissao nao conseguem criar, editar, excluir, emitir ou conciliar.
- [ ] Fluxos de entrada, saida, venda, estoque e comissao conferidos com valores reais de teste.
- [ ] Emissao, consulta, download e cancelamento de NFS-e validados no ambiente correto.
- [ ] Credenciais e certificados ativos aparecem saudaveis em `Admin > Saude do sistema`.
- [ ] Backup recente disponivel e restauracao ensaiada.
- [ ] Endpoint `/api/health` respondendo `200` no ambiente publicado.
- [ ] Nenhum segredo, certificado, token, dump ou planilha real incluido no Git.
- [x] APIs de negocio validam sessao, tenant, empresa ativa e permissao de acao.
- [x] Operacoes sensiveis registram auditoria sem armazenar segredos.
- [x] Novas permissoes operacionais sao provisionadas para tenants existentes.

## Criterios operacionais

- Incidentes fiscais, bancarios e de sincronizacao devem aparecer no painel de saude.
- Toda rota sensivel deve validar usuario ativo, empresa ativa e permissao antes da alteracao.
- Consultas operacionais devem filtrar explicitamente `company_id`, alem da protecao por RLS.
- Exclusoes financeiras precisam de confirmacao, verificacao de vinculos e trilha de auditoria.
- Integracoes externas devem ser idempotentes e oferecer retentativa segura.
- Erros apresentados ao usuario nao devem conter stack trace, token, certificado ou payload sensivel.

## Fluxos de aceite

### Servicos recorrentes

1. Cadastrar cliente.
2. Cadastrar contrato.
3. Gerar competencia financeira sem duplicidade.
4. Preparar e emitir NFS-e opcionalmente.
5. Gerar cobranca opcionalmente.
6. Registrar recebimento e refletir no fluxo de caixa e relatorios.

### Otica

1. Cadastrar ou localizar paciente.
2. Registrar receita sem perder o historico anterior.
3. Realizar venda de produto ou servico.
4. Baixar estoque e gerar financeiro e comissao.
5. Registrar recebimento e conferir relatorios.

### Escola de futebol

1. Cadastrar atleta e responsavel.
2. Vincular turma e matricula.
3. Gerar mensalidade idempotente.
4. Registrar recebimento e presenca.
5. Consultar historico e relatorios do aluno.

## Fases seguintes

1. [Concluido] Onboarding guiado e importadores oficiais por segmento.
2. [Concluido] Automatizar competencias, notificacoes e cobrancas recorrentes.
3. [Concluido] Implementar limites reais dos planos e cobranca da assinatura SaaS.
4. [Em andamento] Executar piloto controlado com empresas reais antes da abertura comercial. O acompanhamento esta disponivel em `Admin > Pilotos` e o procedimento esta em `docs/piloto-controlado.md`.
