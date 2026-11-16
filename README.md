# Agente Nutricional com Gemini

Assistente de chat que responde dúvidas sobre alimentação consultando fontes de dados por **function calling**, em vez de depender do "achismo" do modelo.

## Problema

Modelos de linguagem respondem sobre nutrição com segurança, mas nem sempre com números corretos. Este projeto força o modelo a consultar fontes  e a citar de onde veio cada dado.

## Solução

O navegador fala com um servidor Node, que fala com o Gemini. O modelo decide quais ferramentas chamar, o servidor as executa e devolve o resultado ao modelo, que então escreve a resposta.

```
Navegador (chat)  →  Servidor Node (Express)  →  Gemini API
                          │  ↑  chave só aqui        │
                          │  └── resultados ←────────┘  (function calling)
                          ├─ buscar_alimento  → data/taco*.csv
                          ├─ consultar_guia   → data/guia_alimentar.json
                          ├─ calcular_refeicao → soma de buscar_alimento × gramas
                          └─ ranking_nutriente → ordena a TACO por nutriente
```

| Ferramenta | Fonte | Para quê |
| --- | --- | --- |
| `buscar_alimento(nome)` | Tabela TACO (597 alimentos) | Energia, proteína, lipídios, carboidrato, fibra, cálcio, ferro, sódio e potássio por 100 g |
| `consultar_guia(tema)` | Guia Alimentar para a População Brasileira | Recomendações oficiais |
| `calcular_refeicao(itens)` | TACO | Soma calorias e nutrientes de uma refeição com vários alimentos e quantidades |
| `ranking_nutriente(nutriente, filtros)` | TACO | Ordena alimentos por um nutriente ("qual carne tem mais proteína?") |

O cálculo é feito no código, não pelo modelo, para evitar erros de conta.

## Ferramentas

Node.js 18+, Express, SDK `@google/genai`, HTML/CSS/JavaScript puro no front-end. Modelo configurável por `GEMINI_MODEL`.

## Exemplos de conversa

*(Colar aqui 4 a 5 conversas reais, uma de cada tipo, com print ou texto.)*

1. "Quantas calorias tem 100 g de arroz cozido e o que o Guia Alimentar recomenda sobre arroz com feijão?"
2. "Compare a proteína de 100 g de feijão cozido e de 100 g de frango grelhado."
3. "Quantas calorias tem um prato com 150 g de arroz, 100 g de feijão e 120 g de frango grelhado?"
4. "Qual carne tem mais proteína?" (usa o ranking)
5. Pergunta fora do escopo, como pedir um diagnóstico, para mostrar a recusa segura.

## Resultado

- Base TACO completa (597 alimentos), com tratamento explícito de dados ausentes
- 4 ferramentas chamadas pelo modelo, com tratamento de "alimento não encontrado" e de erro da API
- 2 suítes de teste automatizadas (`npm test`): ferramentas e loop do agente (com modelo simulado)
- Cálculo de refeição verificado por teste: 150 g de arroz tipo 1 + 100 g de feijão carioca = 268,8 kcal e 8,6 g de proteína, igual à conta feita à mão

## Como rodar

```bash
npm install
cp .env.example .env     # no Windows: copy .env.example .env
# edite o .env e cole sua chave (Google AI Studio, tem camada gratuita)
npm start                # http://localhost:3000
npm test                 # testes, não precisam de chave
```

### Base de dados (TACO completa)

`data/taco.csv` contém a **TACO 4ª edição completa: 597 alimentos** e 28 nutrientes por 100 g de parte comestível.

- **Fonte original:** TACO, 4ª ed. ampliada e revisada, NEPA/UNICAMP, 2011. A publicação permite reprodução citando a fonte.
- **CSV processado de:** [brolesi/taco](https://github.com/brolesi/taco) (código sob licença MIT; os dados pertencem à fonte original).
- **Dados ausentes:** células vazias significam "sem dado na TACO" e nunca são tratadas como zero. A calculadora avisa quando um total pode estar subestimado.
- **Traços:** a TACO marca "Tr" (traço), que o código trata como 0.

## Desempenho

O servidor registra no terminal o tempo de cada chamada ao Gemini (`[gemini] passo 1: ... ms`) e o total por pergunta (`[chat] total: ... ms`). A busca local na TACO leva cerca de 1 ms, então quase todo o tempo é da API. Para reduzir: use `GEMINI_THINKING=low` ou `minimal` e um modelo "flash-lite" em `GEMINI_MODEL`.

## Limitações e próximos passos

- O Guia Alimentar é um resumo parafraseado em 5 temas. Antes de divulgar, conferir os textos no original.
- A TACO tem variações do mesmo alimento (arroz tipo 1, tipo 2, integral). O agente informa qual versão usou, mas pode escolher outra que a pretendida se o nome for genérico.
- A TACO é de 2011 e muitos alimentos têm campos sem análise (por exemplo, fibra).
- O agente não lê o Guia inteiro: consulta temas pré-definidos. Próximo passo: busca por trechos do PDF oficial.
- Próximo passo opcional: acrescentar uma ferramenta com dados de gasto das famílias brasileiras (POF/IBGE).
- Histórico de conversa guardado só no navegador. Sem login e sem banco de dados.
- Respostas geradas por IA podem conter erros.

## Segurança e privacidade

- **A chave de API fica só no servidor** (`.env`, ignorado pelo Git). O navegador nunca a vê.
- Limites: 500 caracteres por mensagem, 10 mensagens de histórico e 15 perguntas por minuto por IP.
- O que vai ao Gemini: a pergunta, o histórico recente e os resultados das ferramentas. Nenhum dado pessoal é pedido ou guardado.
- A interface usa `textContent`, não `innerHTML`, para não executar HTML vindo das respostas.
- O *system prompt* proíbe diagnóstico, prescrição e dietas, e manda indicar um profissional de saúde.

## Uso de IA no desenvolvimento

*(Preencher: qual ferramenta de vibe coding você usou, o que revisou e o que corrigiu.)*

## Fontes

- Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição, NEPA/UNICAMP, 2011
- Guia Alimentar para a População Brasileira, Ministério da Saúde
- Dados processados da TACO: https://github.com/brolesi/taco
