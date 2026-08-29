# Automacoes recorrentes

## Escopo

O processamento recorrente cobre:

- contratos de servicos mensais, trimestrais, semestrais e anuais;
- mensalidades de matriculas do segmento Escola de futebol;
- geracao idempotente da entrada financeira;
- inclusao opcional da NFS-e na fila fiscal;
- emissao opcional de cobranca quando o Banco Inter estiver ativo;
- historico por origem e competencia;
- notificacoes por empresa para conclusoes, pendencias e falhas.
- alertas internos para entradas e contas a pagar vencidas ou a tres dias do vencimento.

Lancamentos atrasados ainda abertos passam automaticamente para o status `vencido`. A automacao nao baixa, cancela ou concilia valores.

## Seguranca fiscal

Marcar a automacao de NFS-e nao transmite a nota. O documento recebe o status `enfileirada` e continua exigindo conferencia e confirmacao do operador em `Fiscal > Emissao de NFS-e`.

Ao enfileirar uma NFS-e, o sistema garante primeiro a entrada financeira da mesma competencia. A chave unica de empresa, origem e competencia impede duplicidade em retentativas.

## Agendamento

A Vercel chama `GET /api/cron/recorrencias` diariamente as 09:00 UTC (06:00 no horario de Brasilia). A rota exige `Authorization: Bearer <CRON_SECRET>`.

Configure `CRON_SECRET` no ambiente de producao com um valor longo e aleatorio. A execucao tambem pode ser iniciada para a empresa ativa em `Configuracoes > Automacoes`, desde que o usuario tenha permissao para configurar a empresa.

## Publicacao

1. Aplicar `20260829140000_recurring_automation.sql` depois das migrations comerciais anteriores.
2. Configurar `CRON_SECRET` na Vercel.
3. Publicar a aplicacao.
4. Ativar as opcoes somente nos contratos e matriculas desejados.
5. Executar manualmente uma vez e conferir historico, notificacoes, entradas e fila fiscal.
6. Manter o boleto desativado enquanto a integracao Banco Inter nao estiver validada para o tenant.

## Retentativas

Execucoes concluidas nao sao repetidas. Execucoes parciais ou com erro podem ser tentadas novamente apos cinco minutos; os efeitos financeiros, fiscais e bancarios permanecem protegidos por chaves idempotentes.
