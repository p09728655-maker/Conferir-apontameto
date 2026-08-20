/* Teste do núcleo de cálculo do index.html (parser, modelo, anomalias).
   Uso: node testes/teste-nucleo.mjs
   Extrai o bloco entre NUCLEO-INICIO e NUCLEO-FIM e valida contra os dados
   reais do relatório de 19/08/26 da máquina FUR16. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const ini = html.indexOf('NUCLEO-INICIO'), fim = html.indexOf('NUCLEO-FIM');
if (ini < 0 || fim < 0) { console.error('marcadores do núcleo não encontrados'); process.exit(1); }
const nucleo = html.slice(html.indexOf('*/', ini) + 2, html.lastIndexOf('/*', fim));

const api = new Function(nucleo + `
  return {parsearRelatorio, construirModelo, hhmmParaMinutos, numeroBR, mediana};
`)();

const AMOSTRA = readFileSync(join(raiz, 'testes', 'amostra-19-08.txt'), 'utf8');

let falhas = 0, testes = 0;
function ok(nome, cond, detalhe) {
  testes++;
  if (cond) console.log('  ok   ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (detalhe ? '  ->  ' + detalhe : '')); }
}
function perto(a, b, tol = 1e-6) { return a !== null && b !== null && Math.abs(a - b) <= tol; }

console.log('\n== hhmmParaMinutos ==');
ok('8,53 = 533 min',  api.hhmmParaMinutos('8,53').min === 533);
ok('9,00 = 540 min',  api.hhmmParaMinutos('9,00').min === 540);
ok('16,52 = 1012 min',api.hhmmParaMinutos('16,52').min === 1012);
ok('5,28 = 328 min (nao 5,28h)', api.hhmmParaMinutos('5,28').min === 328);
ok('16,5 = 16h50',    api.hhmmParaMinutos('16,5').min === 1010);
ok('9,73 rejeitado (minuto>59)', api.hhmmParaMinutos('9,73').min === null && /59/.test(api.hhmmParaMinutos('9,73').erro));
ok('texto rejeitado', api.hhmmParaMinutos('abc').min === null);

console.log('\n== parser ==');
const { registros, diagnostico } = api.parsearRelatorio(AMOSTRA);
ok('20 linhas de dados lidas', diagnostico.lidas === 20, 'lidas=' + diagnostico.lidas);
ok('nenhuma falha de leitura', diagnostico.falhas.length === 0, JSON.stringify(diagnostico.falhas.slice(0, 3)));
const cl = diagnostico.lidas + diagnostico.estrutura + diagnostico.totalizadores + diagnostico.ruido + diagnostico.vazias + diagnostico.falhas.length;
ok('classificacao fecha com o total de linhas', cl === diagnostico.linhasTotais, cl + ' vs ' + diagnostico.linhasTotais);
ok('18 cabecalhos de bloco', diagnostico.estrutura === 18, 'n=' + diagnostico.estrutura);
ok('10 totalizadores', diagnostico.totalizadores === 10, 'n=' + diagnostico.totalizadores);
ok('9 subtotais capturados', diagnostico.subtotais.length === 9, 'n=' + diagnostico.subtotais.length);
ok('rodape 9,41 capturado', perto(diagnostico.totalGeral, 9.41, 1e-9), String(diagnostico.totalGeral));
const r405 = registros.find(r => r.ordem === '801405');
ok('801405 produto 794.001.116', r405.produto === '794.001.116');
ok('801405 peca 794.001 / cor 116', r405.peca === '794.001' && r405.cor === '116');
ok('801405 16,52->1012 e 17,00->1020', r405.horaInicioMin === 1012 && r405.horaFimMin === 1020);
ok('801405 qtde produzida 0', r405.qtdeProduzida === 0);
ok('801405 horas padrao 0,08', perto(r405.horasPadrao, 0.08, 1e-9));
ok('descricao herdada do bloco', registros.find(r => r.ordem === '801403').descricao === 'RACK JOAQUIM TAMPO 1500X336X15 MDP 1 OFF WHITE');
ok('maquina e funcionario lidos', r405.maquina === 'FUR16' && r405.funcionario === '893' && r405.funcionarioNome === 'MAURICIO CARLOS FERREIRA');
ok('fase 55', r405.fase === '55');

console.log('\n== conferencia de totais (3 vias) ==');
const m = api.construirModelo(registros, diagnostico);
const c = m.conferencia;
ok('soma das linhas = 7,010000',    perto(c.somaLinhas, 7.01, 1e-6), String(c.somaLinhas));
ok('soma dos subtotais = 8,210000', perto(c.somaSubtotais, 8.21, 1e-6), String(c.somaSubtotais));
ok('rodape = 9,410000',             perto(c.rodape, 9.41, 1e-9), String(c.rodape));
ok('divergencia linhas x subtotais sinalizada', c.linhasVsSubtotais.divergente);
ok('divergencia subtotais x rodape sinalizada', c.subtotaisVsRodape.divergente);
ok('3 produtos com subtotal divergente', c.porProduto.length === 3, 'n=' + c.porProduto.length);
ok('cada divergencia vale 0,4 h', c.porProduto.every(p => perto(p.diferenca, 0.4, 1e-6)));

console.log('\n== classificacao das ordens ==');
const of = n => m.ordens.find(o => o.ordem === n);
ok('801405 = partida incompleta', of('801405').situacao === 'incompleta', of('801405').situacao);
ok('801405 fora dos calculos', of('801405').elegivel === false);
ok('801510 = duracao zero', of('801510').situacao === 'duracao-zero', of('801510').situacao);
ok('801510 fora dos calculos', of('801510').elegivel === false);
ok('18 OFs elegiveis', m.resumo.ofsValidas === 18, 'n=' + m.resumo.ofsValidas);
ok('nenhuma OF aberta na amostra', m.resumo.ofsAbertas === 0);

console.log('\n== indicadores por OF ==');
const o403 = of('801403'), o404 = of('801404'), o414 = of('801414');
ok('801403 123 min reais', o403.minutosReais === 123, String(o403.minutosReais));
ok('801403 real 23,81 s/pc', perto(o403.segPecaReal, 23.806, 0.01), String(o403.segPecaReal));
ok('801403 padrao 23,60 s/pc', perto(o403.segPecaPadrao, 23.6003, 0.001), String(o403.segPecaPadrao));
ok('801403 aderencia ~99%', perto(o403.aderencia, 99.13, 0.1), String(o403.aderencia));
ok('801404 real 24,00 s/pc', perto(o404.segPecaReal, 24, 0.001));
ok('801404 padrao 14,31 s/pc', perto(o404.segPecaPadrao, 14.31, 0.001));
ok('801404 aderencia ~60%', perto(o404.aderencia, 59.63, 0.1), String(o404.aderencia));
ok('801403 pecas/min = 2,52', perto(o403.pecasPorMinuto, 2.5203, 0.001));
ok('801414 91 min reais', o414.minutosReais === 91);

console.log('\n== anomalias ==');
const tem = (n, t) => of(n).anomalias.some(a => a.tipo === t);
ok('#2 801188 padrao implausivel', tem('801188', 'padrao-implausivel'));
ok('#2 801189 nao sinalizada', !tem('801189', 'padrao-implausivel'));
ok('#2 801190 nao sinalizada', !tem('801190', 'padrao-implausivel'));
ok('#3 801414 parada embutida', tem('801414', 'parada-embutida'));
ok('#3 801412/13/15 sem parada', !tem('801412','parada-embutida') && !tem('801413','parada-embutida') && !tem('801415','parada-embutida'));
ok('#1 794.001.116 padrao divergente', tem('801404', 'padrao-divergente'));
ok('#1 794.001.006 dentro da faixa', !tem('801403', 'padrao-divergente'));
ok('#1 794.003.070 x 116 sem divergencia', !tem('801412','padrao-divergente') && !tem('801417','padrao-divergente'));
ok('#1 803.001.x sem falso positivo de cor', !tem('801190','padrao-divergente') && !tem('801191','padrao-divergente') && !tem('801192','padrao-divergente'));
ok('#5 801189 padrao inconsistente no proprio item', tem('801189', 'padrao-inconsistente'));
ok('#5 794.003.070 estavel', !tem('801412', 'padrao-inconsistente'));
ok('#4 3 cadeias coladas', m.cadeias.length === 3, 'n=' + m.cadeias.length + ' -> ' + m.cadeias.map(x=>x.duracao).join(','));
ok('#4 801188 em sequencia colada', tem('801188', 'sequencia-colada'));

console.log('\n== #6 ritmo real implausivel ==');
ok('801188 (500 pc em 6 min) sinalizada', tem('801188', 'ritmo-implausivel'));
ok('801189 nao sinalizada', !tem('801189', 'ritmo-implausivel'));
ok('801190 nao sinalizada', !tem('801190', 'ritmo-implausivel'));
ok('801414 continua como parada embutida, nao ritmo', tem('801414','parada-embutida') && !tem('801414','ritmo-implausivel'));
const p803real = m.produtos.find(p => p.produto === '803.001.006');
ok('803.001.006 real com anomalas 7,70 s/pc', perto(p803real.segPecaReal, 7.7, 0.01), String(p803real.segPecaReal));
ok('803.001.006 real limpo 12,69 s/pc', perto(p803real.segPecaRealLimpo, 148*60/700, 1e-9), String(p803real.segPecaRealLimpo));

console.log('\n== peca x cor ==');
const p794001 = m.pecas.find(p => p.peca === '794.001');
ok('794.001 marcada divergente', p794001.divergente === true);
ok('794.001 referencia ~23,9 s/pc', perto(p794001.referencia, 23.903, 0.01), String(p794001.referencia));
const p794003 = m.pecas.find(p => p.peca === '794.003');
ok('794.003 referencia usa ritmo limpo (~12,6 s/pc)', perto(p794003.referencia, (73*60/350 + 76*60/360)/2, 1e-9), String(p794003.referencia));
ok('794.003 referencia nao contaminada pela parada embutida', p794003.referencia < 13);
const p803peca = m.pecas.find(p => p.peca === '803.001');
ok('803.001 referencia usa ritmo limpo (~12,6 s/pc)', p803peca.referencia > 12 && p803peca.referencia < 13, String(p803peca.referencia));
const cor116 = p794001.cores.find(c => c.produto === '794.001.116');
const cor006 = p794001.cores.find(c => c.produto === '794.001.006');
ok('cor 116 fora da faixa', cor116.padraoForaDaFaixa === true);
ok('cor 006 dentro da faixa', cor006.padraoForaDaFaixa === false);
ok('cor 116 desvio ~ -40%', perto(cor116.desvioReferencia * 100, -40.13, 0.2), String(cor116.desvioReferencia * 100));
ok('794.003 nao divergente', m.pecas.find(p => p.peca === '794.003').divergente === false);
ok('803.001 nao divergente (implausivel excluida)', m.pecas.find(p => p.peca === '803.001').divergente === false);
const p803 = m.produtos.find(p => p.produto === '803.001.006');
ok('803.001.006 marcado como padrao instavel', p803.padraoInstavel === true);
ok('803.001.006 fora da comparacao entre cores', m.pecas.find(p => p.peca === '803.001').coresInstaveis.length === 1);
ok('803.001 compara apenas .070 e .108', m.pecas.find(p => p.peca === '803.001').qtdeComparaveis === 2);

console.log('\n== turno e tempo sem OF ==');
ok('1 turno (1 maquina, 1 operador, 1 dia)', m.turnos.length === 1, 'n=' + m.turnos.length);
ok('janela de 720 min', m.turnos[0].janela === 720, String(m.turnos[0].janela));
ok('654 min apontados', m.turnos[0].coberto === 654, String(m.turnos[0].coberto));
ok('66 min sem OF', m.turnos[0].semOF === 66, String(m.turnos[0].semOF));
ok('3 lacunas', m.turnos[0].lacunas.length === 3, 'n=' + m.turnos[0].lacunas.length);
ok('sem sobreposicao de apontamento', m.turnos[0].sobreposicao === 0);

console.log('\n== ritmo com e sem anomalas ==');
const pr070 = m.produtos.find(p => p.produto === '794.003.070');
ok('794.003.070 ritmo com anomalas = 440/164 pc/min', perto(pr070.pecasPorMinuto, 440/164, 1e-9), String(pr070.pecasPorMinuto));
ok('794.003.070 ritmo sem anomalas = 350/73 pc/min', perto(pr070.pecasPorMinutoLimpo, 350/73, 1e-9), String(pr070.pecasPorMinutoLimpo));
ok('1 OF descartada do ritmo limpo', pr070.ofsDescartadasRitmo === 1);
const maq = m.maquinas[0];
ok('faixa de ritmo por produto exposta', maq.ritmoMin !== null && maq.ritmoMax !== null && maq.ritmoMax > maq.ritmoMin);

console.log('\n== layout POR FUNCIONARIO (colunas alternativas) ==');
const alt = [
  'FUNCIONARIO : 893 ; MAURICIO CARLOS FERREIRA',
  '801404 ; 794.001.116 ; RACK JOAQUIM TAMPO 1500X336X15 MDP 1 CINAMOMO ; 90,0000 ; 19/08/26 ; FUR16 ;FURADEIRA F601 6545 CNC XZ ; 16,16 ; 16,52 ; 55 ; 0,357750 ; 0,00'
].join('\n');
const alfa = api.parsearRelatorio(alt);
ok('linha POR FUNCIONARIO lida', alfa.diagnostico.lidas === 1, JSON.stringify(alfa.diagnostico.falhas));
if (alfa.registros[0]) {
  const a = alfa.registros[0];
  ok('POR FUNCIONARIO: produto na linha', a.produto === '794.001.116');
  ok('POR FUNCIONARIO: funcionario do cabecalho', a.funcionario === '893' && a.funcionarioNome === 'MAURICIO CARLOS FERREIRA');
  ok('POR FUNCIONARIO: maquina e horas', a.maquina === 'FUR16' && a.horaInicioMin === 976 && a.horaFimMin === 1012);
  ok('POR FUNCIONARIO: quantidade unica', a.qtdeProduzida === 90 && a.qtdeOrdem === 90);
  ok('layout detectado', alfa.diagnostico.layout === 'POR FUNCIONÁRIO', alfa.diagnostico.layout);
}

console.log('\n== colagem sem ";" (texto livre do visualizador) ==');
const livre = 'PRODUTO : 794.001.116   RACK JOAQUIM TAMPO 1500X336X15 MDP 1 CINAMOMO\n' +
  '801404    90,0000    90,0000   19/08/26   FUR16   FURADEIRA F601 6545 CNC XZ   893   MAURICIO CARLOS FERREIRA   16,16   16,52   55   0,357750   0,00';
const l = api.parsearRelatorio(livre);
ok('linha sem ";" lida', l.diagnostico.lidas === 1, JSON.stringify(l.diagnostico.falhas));
if (l.registros[0]) {
  const a = l.registros[0];
  ok('livre: funcionario 893 (nao 6545 da descricao)', a.funcionario === '893', a.funcionario);
  ok('livre: maquina FUR16 + descricao', a.maquina === 'FUR16' && a.maquinaDescricao === 'FURADEIRA F601 6545 CNC XZ');
  ok('livre: horas padrao 0,35775', perto(a.horasPadrao, 0.35775, 1e-9));
}

console.log('\n== linhas ilegiveis nao somem ==');
const sujo = api.parsearRelatorio('PRODUTO : 111.222.333\nDESC QUALQUER\n999999 ; xx ; yy\ntexto solto que nao e nada');
ok('linhas problematicas reportadas', sujo.diagnostico.falhas.length >= 1, 'n=' + sujo.diagnostico.falhas.length);

console.log('\n----------------------------------------');
console.log(falhas === 0 ? `TODOS OS ${testes} TESTES PASSARAM` : `${falhas} de ${testes} TESTES FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
