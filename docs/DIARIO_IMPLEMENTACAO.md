# Diário de Implementação (KIPSTOCK)

## Fase A - Autenticação Zero-Trust (Concluída)
Implementação bem-sucedida da Autenticação Real baseada em JWT e Zero-Trust no backend e frontend. 
Nenhuma quebra de dados ocorreu e o modo offline-first continua intocado, preservando a fila de operações em caso de quedas ou expiração de token.

- Criado middleware `/server/middleware/auth.ts` que valida os JWT enviados no cabeçalho `Authorization: Bearer <token>`.
- Refatorado `server/routes.ts` com `bcrypt.compare` e `jsonwebtoken`.
- O `apiService.ts` foi centralizado para interceptar chamadas nativas de `fetch` e injetar o cabeçalho JWT automaticamente.
- Preservação Offline garantida: 401 dispara `auth-error` que apaga apenas a sessão (mantendo `storageService`).

## Fase B1 - Auditoria e Diagnóstico do Chatbot (Concluída em 2026-10-09)
Foi inspecionado o código real do `server/chat.ts` para verificar o estado da Inteligência Artificial:

### O que encontramos
- **Não há LLM ativo:** Apesar de importar o pacote `@google/genai`, ele nunca é chamado. 
- **Lógica Estrita:** O bot é um grande motor de regras (mais de 2000 linhas) baseado em limpezas de string, `indexOf` e Regex.
- **RAG Hardcoded:** Mensagens no frontend afirmando que o "Sistema MCP e RAG estão blindados" são textos chumbados no código e não representam uma operação de IA.
- **Risco de Segurança e Vazamento de Contexto:** Os carrinhos de orçamento estão guardados em Maps globais, o que pode causar mistura de dados entre usuários ou apagar os orçamentos se o servidor for reiniciado.

### Arquitetura Definida (Fase B2)
O modelo clássico de RAG vetorial foi vetado pelo alto custo e ineficiência. 
No lugar, definiu-se a utilização do Gemini via **Function Calling**, onde o LLM invoca funções TypeScript fortemente tipadas para disparar consultas SQL exatas ao Neon PostgreSQL, formatando a resposta para o usuário de forma garantida (*Data-Grounded*).
Os detalhes completos estão no arquivo `docs/ARQUITETURA_CHATBOT_RAG.md`.

## Fase B2 - Implementação do Chatbot Data-Grounded e Visão (Concluída em 2026-10-09)
- **Chatbot Inteligente:** Criados `server/chat_gemini.ts` e `server/gemini_tools.ts`. As consultas de produtos, orçamentos e adições ao carrinho foram integradas ao `gemini-3.8-flash` via Function Calling nativo.
- **Persistência de Orçamentos:** Criada a tabela `orcamentos_pendentes` no PostgreSQL, eliminando a dependência volátil em memória RAM (`pendingBudgets`).
- **Visão Computacional de Peças:** Refatorado `server/vision.ts` utilizando o SDK `@google/genai` e modelo `gemini-3.8-flash`. Botão `IA / FOTO` posicionado na tela principal da Bipagem com acesso fácil em desktop e mobile.

## Fase B - Integridade de Dados & Sync Queue Offline-First (Concluída em 2026-10-09)
- **Fila de Sincronização (`SyncQueueItem`):** Implementada em `src/services/storageService.ts` sob a chave `kipson_sync_queue_v1`.
- **Prevenção de Perda de Dados (REV-02):** Operações locais de estoque, localização, cadastro e vínculos executadas durante oscilações ou ausência de internet são salvas no LocalStorage e enfileiradas automaticamente.
- **Auto-Reconexão:** Listener para o evento de navegador `online` processa a fila assim que a conexão retorna.
- **Merge Protetivo:** `syncWithBackend()` agora processa as pendências antes de ler do servidor e mescla produtos locais pendentes, evitando que a leitura do banco sobrescreva edições offline (*Last Write Wins* destrutivo prevenido).
- **Indicador Visual na UI:** `Header.tsx` exibe badge dinâmico informando o número de pendências e botão de envio manual forçado.
- **Cotas Persistentes da Visão:** Criada a tabela `api_quotas` no PostgreSQL em `server/db.ts` e integrada a `server/vision.ts`, garantindo que o teto diário de 1.000 requisições não se perca após reinicializações.

## Fase C - Modularização e Desacoplamento do Backend (Concluída em 2026-10-09)
- **Desacoplamento do Monólito (`server/routes.ts`):** O arquivo original continha 3.401 linhas com regras misturadas e rotas duplicadas.
- **Sub-roteadores Especializados:**
  - `server/routes/auth.routes.ts`: Login (`/auth/login`) e CRUD de operadores (`/usuarios`).
  - `server/routes/produtos.routes.ts`: Bipagem rápida (`/produtos/scan`), catálogo, histórico, vínculos de códigos e relacionamento de peças.
  - `server/routes/orcamentos.routes.ts`: CRUD de orçamentos e simulações de balcão.
  - `server/routes/auditoria.routes.ts`: Livro de registros técnicos e reversão pontual de alterações.
  - `server/routes/listas.routes.ts`: Anotações rápidas e lookup interno leve de itens.
  - `server/routes/dashboard.routes.ts`: Métricas consolidadas do armazém.
  - `server/routes/importar.routes.ts`: Comparação e carga em lote de planilhas.
- **Orquestrador Central Enxuto:** `server/routes.ts` foi reduzido de 3.401 linhas para apenas 50 linhas, orquestrando os submódulos e aplicando a proteção global de JWT sem nenhuma quebra de contrato.

