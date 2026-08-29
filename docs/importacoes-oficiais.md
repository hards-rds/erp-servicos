# Importacoes oficiais

A central `Configuracoes > Importacoes` disponibiliza somente os modelos compativeis com o segmento da empresa ativa.

## Fluxo

1. Baixar o modelo XLSX do cadastro desejado.
2. Manter os nomes das colunas da primeira linha.
3. Enviar a planilha e executar a analise.
4. Revisar totais, duplicidades e linhas invalidas.
5. Baixar o CSV de erros quando houver pendencias.
6. Confirmar e importar somente os registros validos.

## Modelos

- Clientes: disponivel para todos os segmentos; exige nome e CPF/CNPJ valido.
- Servicos: disponivel para Tecnologia, Otica e Generico; valida tipo, valor, codigo nacional e NBS.
- Produtos e estoque: disponivel para Tecnologia, Otica e Generico; exige SKU e registra o estoque inicial de forma transacional.
- Turmas: disponivel para Escola de futebol; valida categoria, capacidade e mensalidade.
- Pacientes e receitas: fluxo especializado da Otica, com associacao por documento ou nome unico.

## Garantias

- O arquivo deve ser XLSX, ter no maximo 6 MB e ate 20.000 registros.
- A API valida sessao, empresa ativa, segmento e permissao de criacao.
- As consultas e gravacoes sempre usam a empresa ativa.
- Chaves naturais impedem a repeticao de clientes, servicos, produtos e turmas.
- Linhas invalidas nao impedem a importacao das linhas validas.
- Toda importacao concluida gera registro de auditoria sem armazenar o conteudo da planilha.
- Produtos e movimentos de estoque inicial sao confirmados na mesma transacao do banco.

## Ordem de publicacao

1. Aplicar `20260829120000_commercial_authorization.sql`.
2. Aplicar `20260829130000_standard_product_import.sql`.
3. Publicar a aplicacao.
4. Baixar um modelo de cada segmento e executar uma importacao de homologacao.
