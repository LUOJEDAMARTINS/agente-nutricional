// Servidor intermediário: a chave do Gemini fica só aqui, nunca no navegador.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { responder } from './agent.js';

const PORT = process.env.PORT || 3000;
const MODELO = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const THINKING = process.env.GEMINI_THINKING || ''; // minimal | low | medium | high (opcional)
const MAX_CHARS = 500;
const MAX_HISTORICO = 10;
const LIMITE_POR_MINUTO = 15;

if (!process.env.GEMINI_API_KEY) {
  console.error('Falta GEMINI_API_KEY. Copie .env.example para .env e preencha.');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

// Limite simples por IP (protege a cota da sua chave)
const acessos = new Map();
function limitar(req, res, next) {
  const agora = Date.now();
  const lista = (acessos.get(req.ip) ?? []).filter((t) => agora - t < 60_000);
  if (lista.length >= LIMITE_POR_MINUTO) {
    return res.status(429).json({ erro: 'Muitas perguntas seguidas. Aguarde um minuto.' });
  }
  lista.push(agora);
  acessos.set(req.ip, lista);
  next();
}

app.post('/api/chat', limitar, async (req, res) => {
  const { mensagem, historico } = req.body ?? {};
  if (typeof mensagem !== 'string' || !mensagem.trim()) {
    return res.status(400).json({ erro: 'Envie uma mensagem.' });
  }
  if (mensagem.length > MAX_CHARS) {
    return res.status(400).json({ erro: `Mensagem muito longa (máximo ${MAX_CHARS} caracteres).` });
  }
  const hist = Array.isArray(historico)
    ? historico
        .filter((m) => m && typeof m.text === 'string' && ['user', 'assistant'].includes(m.role))
        .slice(-MAX_HISTORICO)
        .map((m) => ({ role: m.role, text: m.text.slice(0, 2000) }))
    : [];

  try {
    const r = await responder({ ai, modelo: MODELO, historico: hist, mensagem: mensagem.trim(), thinking: THINKING });
    console.log(`[chat] total: ${r.tempoMs} ms`);
    res.json({ resposta: r.texto, ferramentas: r.ferramentasUsadas, tempo_ms: r.tempoMs });
  } catch (e) {
    console.error('Erro na API do Gemini:', e?.status ?? '', e?.message ?? e);
    res.status(502).json({ erro: 'O serviço de IA não respondeu agora. Tente novamente em instantes.' });
  }
});

app.listen(PORT, () => console.log(`Agente nutricional em http://localhost:${PORT} (modelo: ${MODELO}, raciocínio: ${THINKING || 'padrão'})`));
