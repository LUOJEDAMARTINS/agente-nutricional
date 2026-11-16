import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buscarAlimento, consultarGuia, calcularRefeicao, rankingNutriente, executarFerramenta } from '../tools.js';

// A base completa da TACO 4ª ed. tem 597 alimentos
const linhas = fs.readFileSync(new URL('../data/taco.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).length - 1;
assert.ok(linhas >= 597, `esperava 597 alimentos, achei ${linhas}`);


// TACO
let r = buscarAlimento({ nome: 'arroz cozido' });
assert.equal(r.encontrado, true);
assert.ok(r.resultados[0].alimento.toLowerCase().includes('arroz'));
r = buscarAlimento({ nome: 'FEIJAO carioca' }); // sem acento / maiúsculas
assert.equal(r.resultados[0].proteina_g, 4.8);
r = buscarAlimento({ nome: 'unicórnio grelhado' });
assert.equal(r.encontrado, false); // alimento não encontrado
assert.equal(buscarAlimento({}).encontrado, false);

// Guia
assert.equal(consultarGuia({ tema: 'arroz e feijão' }).encontrado, true);
assert.equal(consultarGuia({ tema: 'xyz' }).encontrado, false);

// Calculadora de refeição (confere com a conta feita à mão)
let c = calcularRefeicao({ itens: [{ nome: 'arroz tipo 1 cozido', gramas: 150 }, { nome: 'feijão carioca cozido', gramas: 100 }] });
assert.equal(c.total.energia_kcal, 268.8); // 128,26*1,5 + 76,42*1,0
assert.equal(c.total.proteina_g, 8.6); // 2,52*1,5 + 4,78
assert.equal(c.nao_considerados.length, 0);
assert.equal(c.avisos.length, 0);

// Dado ausente na TACO NÃO vira zero: vira null + aviso (peito de frango grelhado não tem fibra)
c = calcularRefeicao({ itens: [{ nome: 'frango peito sem pele grelhado', gramas: 100 }] });
assert.equal(c.itens[0].fibra_g, null);
assert.ok(c.avisos.some((x) => x.startsWith('fibra_g')));
r = buscarAlimento({ nome: 'frango peito sem pele grelhado' });
assert.ok(r.resultados[0].sem_dado_na_taco.includes('fibra_g'));

// Variações do mesmo alimento são reportadas
r = buscarAlimento({ nome: 'arroz cozido' });
assert.ok(r.total_correspondencias >= 3);
c = calcularRefeicao({ itens: [{ nome: 'arroz cozido', gramas: 100 }, { nome: 'pizza de unicórnio', gramas: 100 }] });
assert.equal(c.itens.length, 1);
assert.equal(c.nao_considerados[0].nome, 'pizza de unicórnio'); // item desconhecido não quebra
assert.ok(calcularRefeicao({ itens: [] }).erro);
assert.ok(calcularRefeicao({ itens: [{ nome: 'arroz', gramas: -5 }] }).nao_considerados.length === 1);
assert.ok(calcularRefeicao({ itens: [{ nome: 'arroz', gramas: 'muito' }] }).nao_considerados.length === 1);

// Ranking: ordenado, sem nulos, conferido contra pandas (53 carnes cruas; 1º = contra-filé, 24 g)
let k = rankingNutriente({ nutriente: 'proteina_g', categoria: 'carnes', preparo: 'cru', limite: 5 });
assert.equal(k.encontrado, true);
assert.equal(k.alimentos_considerados, 53);
assert.equal(k.ranking[0].alimento, 'Carne, bovina, contra-filé, sem gordura, cru');
assert.equal(k.ranking[0].proteina_g, 24);
for (let i = 1; i < k.ranking.length; i++) assert.ok(k.ranking[i - 1].proteina_g >= k.ranking[i].proteina_g);
k = rankingNutriente({ nutriente: 'fibra_g', categoria: 'frutas', ordem: 'menor', limite: 3 });
assert.ok(k.ranking.every((x) => x.fibra_g !== null));
assert.ok(rankingNutriente({ nutriente: 'vitamina_z' }).erro);
assert.equal(rankingNutriente({ nutriente: 'proteina_g', categoria: 'marte' }).encontrado, false);
assert.equal(rankingNutriente({ nutriente: 'proteina_g', limite: 999 }).ranking.length, 10); // limite máximo

// Ferramenta desconhecida e args ausentes não quebram
assert.ok(executarFerramenta('apagar_tudo', {}).erro);
assert.ok(executarFerramenta('buscar_alimento', undefined));
console.log('tools.test.js OK');
