// Simula o Gemini: 1ª resposta pede ferramentas, 2ª responde em texto.
import assert from 'node:assert/strict';
import { responder } from '../agent.js';

let chamadas = 0;
let ultimoContents;
const aiFalso = {
  models: {
    async generateContent({ contents }) {
      chamadas++;
      ultimoContents = contents;
      if (chamadas === 1) {
        return {
          functionCalls: [
            { name: 'buscar_alimento', args: { nome: 'arroz cozido' } },
            { name: 'consultar_guia', args: { tema: 'arroz e feijão' } },
          ],
          candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'buscar_alimento', args: {} } }] } }],
        };
      }
      return { functionCalls: undefined, text: 'Resposta final', candidates: [] };
    },
  },
};

const r = await responder({ ai: aiFalso, modelo: 'x', mensagem: 'oi' });
assert.equal(r.texto, 'Resposta final');
assert.deepEqual(r.ferramentasUsadas.map((f) => f.nome), ['buscar_alimento', 'consultar_guia']);
const ultimaMsg = ultimoContents.at(-1);
assert.equal(ultimaMsg.role, 'user');
assert.equal(ultimaMsg.parts.length, 2);
assert.equal(ultimaMsg.parts[0].functionResponse.response.resultado.encontrado, true);

// Loop infinito de ferramentas é interrompido
const aiLoop = { models: { async generateContent({ config }) {
  if (!config.tools) return { text: 'Resposta final com o que foi consultado', candidates: [] };
  return { functionCalls: [{ name: 'consultar_guia', args: { tema: 'x' } }], candidates: [{ content: { role: 'model', parts: [] } }] };
} } };
const r2 = await responder({ ai: aiLoop, modelo: 'x', mensagem: 'oi' });
// Ao estourar o limite, o agente pede uma resposta final sem ferramentas (em vez de falhar)
assert.equal(r2.texto, 'Resposta final com o que foi consultado');

// Se até a resposta final falhar, devolve mensagem amigável
const aiQuebrado = { models: { async generateContent({ config }) {
  if (!config.tools) throw new Error('falhou');
  return { functionCalls: [{ name: 'consultar_guia', args: { tema: 'x' } }], candidates: [{ content: { role: 'model', parts: [] } }] };
} } };
const r3 = await responder({ ai: aiQuebrado, modelo: 'x', mensagem: 'oi' });
assert.match(r3.texto, /Não consegui concluir/);
console.log('agent.test.js OK');
