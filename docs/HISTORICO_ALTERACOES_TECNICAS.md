# Histórico de Alterações Técnicas
*Registro estrito de todos os arquivos modificados e justificativas.*

## Fase A — Autenticação Zero-Trust
- `server/middleware/auth.ts`: Criação do middleware de autenticação JWT (`requireAuth`).
- `server/routes.ts`: Migração da rota de login para validação com `bcryptjs` e emissão de JWT; proteção global das rotas privadas da API.
- `src/services/apiService.ts`: Injeção automática do cabeçalho `Authorization: Bearer <token>` em todas as requisições autenticadas.
- `src/services/authService.ts`: Armazenamento seguro de token e credenciais no client.

## Fase B1 e B2 — Chatbot Data-Grounded & Visão Computacional
- `server/chat_gemini.ts`: Novo orquestrador de conversação utilizando o SDK `@google/genai` e modelo `gemini-3.8-flash`.
- `server/gemini_tools.ts`: Ferramentas tipadas (`buscar_produtos`, `consultar_codigo`, `adicionar_ao_carrinho`, `ver_carrinho`, `limpar_carrinho`) para consulta fundamentada no banco.
- `server/db.ts`: Adição da tabela `orcamentos_pendentes` para persistência do carrinho no PostgreSQL.
- `server/vision.ts`: Atualização para o SDK oficial `@google/genai` com `gemini-3.8-flash`.
- `src/components/bipagem/BipagemView.tsx` & `src/App.tsx`: Incorporação do botão `IA / FOTO` diretamente no bloco de bipagem.

## Fase B — Integridade de Dados & Sync Queue Offline-First
- `src/services/storageService.ts`: Implementação da Sync Queue (`kipson_sync_queue_v1`), listener de rede para o evento `online`, enfileiramento automático de mutações que falham por rede e merge protetivo no `syncWithBackend()`.
- `src/components/common/Header.tsx`: Adição de badge interativo com contador de pendências offline e botão de sincronização forçada manual.
- `server/db.ts`: Criação da tabela `api_quotas` para controle diário de chamadas de APIs externas.
- `server/vision.ts`: Registro atômico e persistente de cotas diárias no PostgreSQL com fallback em memória.

## Fase C — Modularização e Desacoplamento do Backend
- `server/routes.ts`: Redução de 3.401 para ~50 linhas; atua exclusivamente como roteador raiz central e interceptor de segurança.
- `server/routes/auth.routes.ts`: Roteador isolado para login e controle de usuários.
- `server/routes/produtos.routes.ts`: Roteador isolado de produtos, bipagem e catálogo.
- `server/routes/orcamentos.routes.ts`: Roteador isolado de orçamentos.
- `server/routes/auditoria.routes.ts`: Roteador isolado de livro de auditoria e reversão.
- `server/routes/listas.routes.ts`: Roteador isolado de anotações e listas rápidas.
- `server/routes/dashboard.routes.ts`: Roteador isolado de estatísticas operacionais.
- `server/routes/importar.routes.ts`: Roteador isolado de comparação e importação em lote.
