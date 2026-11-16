// Ferramentas (functions) que o modelo pode chamar. Tudo lê dados locais:
// o modelo nunca "inventa" valores, ele consulta estas fontes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

const normalizar = (t) =>
  String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// CSV simples com suporte a campos entre aspas
function lerCsv(texto) {
  const linhas = texto.trim().split(/\r?\n/);
  const cabecalho = dividir(linhas[0]);
  return linhas.slice(1).map((l) => {
    const c = dividir(l);
    return Object.fromEntries(cabecalho.map((h, i) => [h, c[i]]));
  });
}
function dividir(linha) {
  const out = [];
  let atual = '', aspas = false;
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas;
    else if (ch === ',' && !aspas) { out.push(atual); atual = ''; }
    else atual += ch;
  }
  out.push(atual);
  return out;
}

const TACO = lerCsv(fs.readFileSync(path.join(DIR, 'taco.csv'), 'utf8'));
const GUIA = JSON.parse(fs.readFileSync(path.join(DIR, 'guia_alimentar.json'), 'utf8'));

// Nutrientes expostos ao modelo (nomes iguais às colunas do CSV da TACO)
const NUTRIENTES = [
  'energia_kcal', 'proteina_g', 'lipideos_g', 'carboidrato_g', 'fibra_g',
  'calcio_mg', 'ferro_mg', 'sodio_mg', 'potassio_mg',
];
const STOPWORDS = new Set(['de', 'da', 'do', 'com', 'em', 'e', 'a', 'o']);
const TRACO = 0.001; // a TACO usa "Tr" (traço) = 1e-05 no CSV

// Célula vazia = sem dado (null). Nunca vira zero.
function valor(celula) {
  if (celula === undefined || celula === null || String(celula).trim() === '') return null;
  const n = Number(celula);
  return Number.isFinite(n) ? n : null;
}
const arredondar = (n) => Math.round(n * 10) / 10;

function procurar(nome) {
  const palavras = normalizar(nome).split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !STOPWORDS.has(p));
  if (!palavras.length) return [];
  return TACO
    .map((a) => {
      const d = normalizar(a.descricao);
      if (!palavras.every((p) => d.includes(p))) return null;
      const extras = d.split(/[^a-z0-9]+/).filter(Boolean).length - palavras.length;
      return { a, extras };
    })
    .filter(Boolean)
    .sort((x, y) => x.extras - y.extras || Number(x.a.numero_alimento) - Number(y.a.numero_alimento))
    .map((r) => r.a);
}

function formatar(a) {
  const dados = {};
  const sem_dado = [];
  const tracos = [];
  for (const c of NUTRIENTES) {
    const v = valor(a[c]);
    if (v === null) { dados[c] = null; sem_dado.push(c); }
    else if (v < TRACO) { dados[c] = 0; tracos.push(c); }
    else dados[c] = arredondar(v);
  }
  return {
    numero_alimento: Number(a.numero_alimento),
    alimento: a.descricao,
    categoria: a.categoria,
    ...dados,
    sem_dado_na_taco: sem_dado,
    em_tracos: tracos,
  };
}

export function buscarAlimento({ nome } = {}) {
  if (!normalizar(nome)) return { encontrado: false, erro: 'Informe o nome do alimento.' };
  const achados = procurar(nome);
  if (!achados.length) {
    return {
      encontrado: false,
      mensagem: `Não encontrei "${nome}" na TACO. Tente um nome mais simples (ex.: "arroz", "banana").`,
    };
  }
  return {
    encontrado: true,
    base: 'valores por 100 g de parte comestível',
    fonte: 'TACO, 4ª ed. (NEPA/UNICAMP, 2011)',
    total_correspondencias: achados.length,
    resultados: achados.slice(0, 5).map(formatar),
    observacao: 'null = sem dado na TACO (não é zero). Se houver mais de uma correspondência, diga ao usuário qual foi usada.',
  };
}

export function calcularRefeicao({ itens } = {}) {
  if (!Array.isArray(itens) || !itens.length) {
    return { erro: 'Informe uma lista de itens com nome e gramas.' };
  }
  if (itens.length > 15) return { erro: 'Máximo de 15 itens por refeição.' };

  const total = Object.fromEntries(NUTRIENTES.map((c) => [c, 0]));
  const faltando = Object.fromEntries(NUTRIENTES.map((c) => [c, []])); // itens sem dado por nutriente
  const detalhes = [];
  const naoConsiderados = [];

  for (const item of itens) {
    const gramas = Number(item?.gramas);
    if (!item?.nome || !Number.isFinite(gramas) || gramas <= 0 || gramas > 5000) {
      naoConsiderados.push({ nome: item?.nome ?? '(sem nome)', motivo: 'quantidade inválida (use gramas entre 1 e 5000)' });
      continue;
    }
    const achados = procurar(item.nome);
    if (!achados.length) {
      naoConsiderados.push({ nome: item.nome, motivo: 'não encontrado na TACO' });
      continue;
    }
    const a = achados[0]; // melhor correspondência
    const fator = gramas / 100;
    const parcial = {};
    for (const c of NUTRIENTES) {
      const v = valor(a[c]);
      if (v === null) { parcial[c] = null; faltando[c].push(a.descricao); }
      else { parcial[c] = arredondar(v * fator); total[c] += v * fator; }
    }
    detalhes.push({
      pedido: item.nome,
      alimento_usado: a.descricao,
      outras_opcoes: achados.slice(1, 4).map((x) => x.descricao),
      gramas,
      ...parcial,
    });
  }

  const totalFinal = {};
  const avisos = [];
  for (const c of NUTRIENTES) {
    totalFinal[c] = detalhes.length ? arredondar(total[c]) : null;
    if (detalhes.length && faltando[c].length) {
      avisos.push(`${c}: sem dado na TACO para ${faltando[c].join('; ')}. O total pode estar subestimado.`);
    }
  }
  return {
    fonte: 'TACO, 4ª ed. (NEPA/UNICAMP, 2011)',
    calculo: 'soma de (valor por 100 g × gramas / 100) para cada item',
    itens: detalhes,
    total: detalhes.length ? totalFinal : null,
    avisos,
    nao_considerados: naoConsiderados,
  };
}

export function consultarGuia({ tema } = {}) {
  const q = normalizar(tema);
  const achados = GUIA.temas.filter(
    (t) => normalizar(t.tema).includes(q) || t.palavras_chave.some((p) => q.includes(p) || p.includes(q)),
  );
  if (!q || !achados.length) {
    return { encontrado: false, temas_disponiveis: GUIA.temas.map((t) => t.tema) };
  }
  return {
    encontrado: true,
    fonte: 'Guia Alimentar para a População Brasileira (Ministério da Saúde)',
    aviso: GUIA.aviso,
    trechos: achados.map((t) => ({ tema: t.tema, resumo: t.resumo })),
  };
}

export function rankingNutriente({ nutriente, categoria, preparo, termo, ordem, limite } = {}) {
  if (!NUTRIENTES.includes(nutriente)) {
    return { erro: 'Nutriente inválido.', nutrientes_disponiveis: NUTRIENTES };
  }
  const cat = normalizar(categoria);
  const prep = normalizar(preparo);
  const palavras = normalizar(termo).split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !STOPWORDS.has(p));
  const n = Math.min(Math.max(Number(limite) || 5, 1), 10);
  const menor = normalizar(ordem) === 'menor';

  const candidatos = TACO.filter((a) => {
    if (cat && !normalizar(a.categoria).includes(cat)) return false;
    if (prep && normalizar(a.preparo) !== prep) return false;
    if (palavras.length && !palavras.every((p) => normalizar(a.descricao).includes(p))) return false;
    return valor(a[nutriente]) !== null; // sem dado fica de fora do ranking
  });
  if (!candidatos.length) {
    return {
      encontrado: false,
      mensagem: 'Nenhum alimento com dado para esses filtros.',
      categorias_disponiveis: [...new Set(TACO.map((a) => a.categoria))],
    };
  }
  candidatos.sort((x, y) => (menor ? valor(x[nutriente]) - valor(y[nutriente]) : valor(y[nutriente]) - valor(x[nutriente])));
  return {
    encontrado: true,
    fonte: 'TACO, 4ª ed. (NEPA/UNICAMP, 2011)',
    base: 'valores por 100 g de parte comestível',
    nutriente,
    ordem: menor ? 'menor para maior' : 'maior para menor',
    filtros: { categoria: categoria || null, preparo: preparo || null, termo: termo || null },
    alimentos_considerados: candidatos.length,
    ranking: candidatos.slice(0, n).map((a, i) => ({
      posicao: i + 1,
      alimento: a.descricao,
      categoria: a.categoria,
      [nutriente]: arredondar(valor(a[nutriente])),
    })),
    observacao:
      'Só entram alimentos com dado na TACO. Compare alimentos com o mesmo preparo (cru com cru, cozido com cozido): o teor de água muda os valores por 100 g. Pode haver itens processados (ex.: carne seca) nas primeiras posições.',
  };
}

export const funcoes = {
  buscar_alimento: buscarAlimento,
  consultar_guia: consultarGuia,
  calcular_refeicao: calcularRefeicao,
  ranking_nutriente: rankingNutriente,
};

export function executarFerramenta(nome, args) {
  const fn = funcoes[nome];
  if (!fn) return { erro: `Ferramenta desconhecida: ${nome}` };
  try {
    return fn(args ?? {});
  } catch (e) {
    return { erro: 'Falha ao executar a ferramenta.' };
  }
}

// Declarações enviadas ao Gemini (function calling)
export const declaracoes = [
  {
    name: 'buscar_alimento',
    description:
      'Busca a composição nutricional (por 100 g) de um alimento na tabela TACO (597 alimentos): energia, proteína, lipídios, carboidrato, fibra, cálcio, ferro, sódio e potássio.',
    parameters: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Nome do alimento, ex.: "arroz cozido" ou "feijão carioca".' } },
      required: ['nome'],
    },
  },
  {
    name: 'consultar_guia',
    description: 'Consulta recomendações do Guia Alimentar para a População Brasileira sobre um tema.',
    parameters: {
      type: 'object',
      properties: { tema: { type: 'string', description: 'Tema, ex.: "arroz e feijão", "ultraprocessados".' } },
      required: ['tema'],
    },
  },
  {
    name: 'calcular_refeicao',
    description:
      'Soma energia e nutrientes de uma refeição, a partir de uma lista de alimentos e quantidades em gramas, usando a tabela TACO.',
    parameters: {
      type: 'object',
      properties: {
        itens: {
          type: 'array',
          description: 'Alimentos da refeição.',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string', description: 'Nome do alimento, ex.: "arroz cozido".' },
              gramas: { type: 'number', description: 'Quantidade em gramas.' },
            },
            required: ['nome', 'gramas'],
          },
        },
      },
      required: ['itens'],
    },
  },
  {
    name: 'ranking_nutriente',
    description:
      'Ordena alimentos da TACO por um nutriente (por 100 g). Use para perguntas como "qual carne tem mais proteína?" ou "qual fruta tem mais fibra?". Chame UMA vez, com filtros, em vez de buscar alimentos um a um.',
    parameters: {
      type: 'object',
      properties: {
        nutriente: {
          type: 'string',
          description: 'Um de: energia_kcal, proteina_g, lipideos_g, carboidrato_g, fibra_g, calcio_mg, ferro_mg, sodio_mg, potassio_mg.',
        },
        categoria: {
          type: 'string',
          description: 'Opcional. Parte do nome da categoria: "carnes", "frutas", "cereais", "leguminosas", "verduras", "pescados", "leite", "ovos", "nozes".',
        },
        preparo: { type: 'string', description: 'Opcional. cru, cozido, grelhado, assado, frito, refogado ou torrado.' },
        termo: { type: 'string', description: 'Opcional. Palavra no nome do alimento, ex.: "frango", "boi".' },
        ordem: { type: 'string', description: 'Opcional. "maior" (padrão) ou "menor".' },
        limite: { type: 'number', description: 'Opcional. Quantos itens devolver (1 a 10, padrão 5).' },
      },
      required: ['nutriente'],
    },
  },
];
