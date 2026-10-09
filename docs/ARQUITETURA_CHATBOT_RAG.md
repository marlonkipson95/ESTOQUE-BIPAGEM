# ARQUITETURA E DIAGNÓSTICO DO CHATBOT - KIPSTOCK

## 1. Diagnóstico do Chatbot Atual (O que realmente está no código)

Uma inspeção direta no arquivo `server/chat.ts` revelou a verdadeira arquitetura de processamento de mensagens atual do sistema:

- **LLMs e IAs Generativas:** Inexistentes na prática. Apesar de importar `GoogleGenAI` no topo do arquivo, o objeto não é instanciado em lugar nenhum. O bot **não processa linguagem natural real**.
- **Motor de Interpretação:** O código depende 100% de `if/else`, limpeza estrita (`message.trim().toLowerCase()`) e uma cadeia enorme de Expressões Regulares (Regex) tentando adivinhar as intenções (ex: `lower.includes('onde')`, `lower.startsWith('altere')`).
- **Estado de Conversação:** Utiliza objetos iteráveis na memória (`Maps`) não persistidos (ex: `pendingBudgets`, `activeQuickLists`). Em caso de reinicialização do servidor Node/Vite, todos os carrinhos de orçamento e estados temporários se perdem instantaneamente.
- **Integração RAG/Banco de Dados:** O sistema realiza consultas SQL literais (com `ILIKE`) baseadas nos matches de Regex capturados na string, porém as mensagens indicando *"Sistemas RAG e MCP operando"* vistas no frontend são falsas, retornadas via concatenação manual de texto hardcoded.
- **Proteção e Autenticação:** Como comprovado na Etapa A, a rota `/api/chat` é agora interceptada com sucesso pelo middleware que exige JWT válido, garantindo que usuários anônimos não consigam interagir com o bot.

### Riscos da Abordagem Atual
1. A ausência de LLM torna o assistente frustrante. Usuários precisam adivinhar a sintaxe exata dos comandos para obterem dados (ex: `onde está a peça X` funciona, mas `procure a peça X` pode falhar).
2. O tratamento de dados não cobre ambiguidades adequadamente.
3. Não há risco inerente de "alucinação gerativa" (porque a IA não existe), mas há o risco de **falha funcional contínua** (Falso Negativo), que diminui drasticamente a adoção por parte dos usuários de chão de fábrica.

---

## 2. Proposta de Arquitetura (Data-Grounded Function Calling)

A infraestrutura do KIPSTOCK trabalha com dados altamente estruturados (produtos, preços, locações no PostgreSQL). 
Implementar um sistema de **RAG tradicional (Vector DB / Embeddings) NÃO é recomendado**, pois buscar similaridade semântica em "tabelas de preços" ou "códigos de peça" costuma degradar a exatidão, causar lentidão injustificada e criar custos de infraestrutura adicionais desnecessários.

**Arquitetura Proposta: LLM com "Function Calling" (Chamada de Ferramentas Restritas)**

1. **Intérprete (LLM):** Substituir as Regex por um LLM enxuto e rápido (ex: *Gemini 1.5 Flash*), cujo único papel será entender a linguagem do usuário e invocar as funções corretas.
2. **Tools (Ferramentas):** O LLM terá acesso a um dicionário estrito de ferramentas:
   - `consultar_produto_por_codigo(codigo: string)`
   - `consultar_localizacao(termo: string)`
   - `gerar_orcamento(itens: array)`
3. **Data-Grounded (Aterramento em Dados Reais):** Quando o LLM disparar uma "Tool", o Node.js roda a instrução SQL real contra o PostgreSQL Neon, formata o resultado em JSON e devolve para o LLM construir a frase de resposta em linguagem humana, eliminando 100% da chance de "invencionismo".
4. **Instruções Rígidas (System Prompt):**
   - *"Se a ferramenta de busca retornar vazio, você DEVE dizer que a peça não está no sistema."*
   - *"Você NUNCA deve tentar inferir ou deduzir um código, localização ou preço."*

### Vantagens e Custos Desta Proposta
- **Custo:** Muito baixo. Utilizar *Gemini 1.5 Flash* focado unicamente na extração de intenções via Tool Calling gasta pouquíssimos tokens. Sem custos de um novo banco vetorial.
- **Risco de Alucinação:** Resolvido mecanicamente pelas funções de restrição. Se a Tool do PostgreSQL retornar que o preço é R$ 0,00, a IA não pode inventar um preço da sua base de treinamento.
- **Complexidade:** Substitui quase 2000 linhas de Regex em `server/chat.ts` por blocos semânticos e tipados simples, simplificando radicalmente a manutenção futura.

---

## 3. Próximos Passos Priorizados (Execução)

1. **Refatorar `server/chat.ts`** para carregar a instância oficial `@google/genai` (requer `GEMINI_API_KEY` na `.env`).
2. Declarar as **Tools** no padrão oficial.
3. Desenvolver o **System Prompt** estrito que barra alucinações.
4. Mover o armazenamento de "estados da sessão" (orçamentos em andamento) para o localStorage do frontend ou para uma tabela no PostgreSQL, a fim de evitar falhas de Serverless (Fase C/D futura, para já, manteremos memória mas isolada por UserID derivado do JWT).
5. Executar os casos de teste especificados nos requisitos (testar limites com peça existente, inexistente, ambígua).
