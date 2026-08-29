# Piloto controlado

O piloto controlado valida a plataforma com empresas reais antes da abertura comercial. O painel fica em `Admin > Pilotos` e somente o `system_admin` pode iniciar, atualizar ou aprovar um piloto.

## Preparacao

1. Aplicar todas as migrations, incluindo `20260829160000_controlled_pilot.sql`.
2. Confirmar em `Admin > Saude do sistema` que nao existem incidentes criticos sem responsavel.
3. Escolher ao menos um tenant de cada segmento que sera comercializado: Tecnologia, Otica e Escola de futebol.
4. Definir operador responsavel, prazo, dados de teste e canal para registro de falhas.

## Execucao

1. Abrir `Admin > Pilotos`, escolher o tenant e iniciar o piloto.
2. Executar cada criterio com um usuario e dados representativos do cliente.
3. Registrar evidencia objetiva: identificador do registro, data, arquivo exportado ou referencia do teste.
4. Marcar como `Falhou` quando o resultado divergir do esperado. O piloto deve ficar `Bloqueado` enquanto a correcao nao for validada novamente.
5. Usar `Atualizar criterios` quando uma nova versao acrescentar validacoes; resultados existentes nao sao apagados.

## Aprovacao

O sistema so aceita a aprovacao quando todos os criterios obrigatorios estiverem aprovados e os sinais automaticos nao tiverem bloqueadores. Os sinais verificam:

- tenant e empresa ativos;
- ao menos um usuario ativo;
- assinatura ativa ou em teste;
- ausencia de falhas recentes em NFS-e, Banco Inter e PlanetChat.

Itens opcionais podem ser marcados como `Nao aplicavel` quando o recurso nao fizer parte do escopo contratado. Criterios obrigatorios nunca aceitam esse status.

## Encerramento

Antes do commit e deploy comercial, repetir `pnpm release:check`, revisar migrations pendentes, validar backup e restauracao, conferir o endpoint `/api/health` publicado e arquivar as evidencias dos pilotos aprovados.
