# Análise de Apontamento de Produção — Patrimar Móveis

Ferramenta de análise do relatório **REL. PLANILHAMENTO POR PRODUTO / POR FUNCIONÁRIO**
do ERP Industrial. Descobre o ritmo real de cada máquina por produto e quais tempos
padrão do ERP estão errados.

## Uso

Abra `index.html` — direto do disco (`file://`) ou pela URL publicada. Cole o texto do
relatório ou carregue um `.txt` / `.csv`. Nenhum dado sai do navegador.

O botão **Carregar dados de exemplo** traz um dia real da máquina FUR16 para teste imediato.

## O problema que ele resolve

A coluna `HORAS` do relatório **não é tempo real** — é `QTDE PROD. × tempo padrão do item`.
O tempo real só existe na diferença `HR.FIM − HR.INICIO`, que está no formato **HH.MM**
(`8,53` = 8h53min, não 8,53 horas). Tratar esse campo como decimal erra todos os tempos.

## O que ele detecta

| # | Verificação | Critério |
|---|---|---|
| 1 | Padrão divergente entre cores | Mesma peça física (`AAA.BBB`), tempo padrão diferindo mais de 15% |
| 2 | Padrão implausível | Tempo padrão mais de 5× fora da mediana das outras OFs do produto |
| 3 | Parada embutida | Duração real mais de 2,5× a mediana das OFs gêmeas |
| 4 | Sequência colada | HR.FIM de uma OF = HR.INICIO da seguinte por mais de 2 h |
| 5 | Padrão inconsistente entre OFs do mesmo item | Mesmo código com tempos padrão diferentes no período |
| 6 | Ritmo real implausível | Duração real mais de 2,5× **mais rápida** que a mediana das gêmeas |
| 7 | Rateio de lote de execução | OF de duração zero colada no horário de outra: o ERP rateia o tempo quando a máquina roda um lote único em vez de abrir OF por OF (típico de assistência). A quantidade entra no ritmo do lote |
| 8 | Parada cobre a OF inteira | Produção e parada lançadas no mesmo horário, sem minuto sobrando para a peça sair |

Além disso: ordens abertas, pernas de ordem partida sem contraparte, duração zero,
hora fora do formato HH.MM, apontamentos sobrepostos, tempo sem OF e conferência de
totais em três vias (soma das linhas × subtotais do relatório × rodapé).

## Relatório de paradas (opcional)

Cole também o **RELAT. PLANILHAMENTOS PARADAS** do mesmo período. O app cruza os dois
e responde o que o apontamento sozinho não responde:

- quanto do **tempo sem OF** é setup, manutenção, café ou banheiro apontado — e quanto
  continua sem explicação nenhuma;
- quanta parada foi lançada **dentro** da janela de uma OF, onde entra na conta como se
  fosse produção;
- **ritmo líquido** por produto: peças por minuto descontando a parada de dentro da janela.

Aceita tanto a exportação em uma linha por parada quanto a colagem do PDF, em que nome e
máquina caem numa linha de continuação.

## Estrutura

Arquivo único, sem build, sem dependências, sem servidor. O código está em seções
comentadas: tokens, parser, modelo, anomalias, agregações, render e exportação.

Todo o parsing está isolado em `parsearRelatorio(texto)`, que devolve um array de
objetos normalizados. Trocar a fonte de dados (leitura direta do banco do ERP, Google
Sheets, CSV) não exige reescrever o resto da aplicação.

## Testes

```bash
node testes/teste-nucleo.mjs
```

Extrai o núcleo de cálculo do `index.html` e valida parser, classificação de ordens,
indicadores e as seis detecções contra um dia real de produção.
