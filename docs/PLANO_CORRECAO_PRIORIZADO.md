# Plano de Correção Priorizado

Este plano detalha as etapas de correção e evolução do KIPSTOCK, divididas em 4 Fases incrementais.

## FASE A — Contenção de Riscos Críticos (Prioridade Máxima)
**Foco:** Autenticação, autorização e proteção das rotas contra acesso indevido.
- **Tarefa A.1:** Implementar autenticação via JWT no backend.
  - **Arquivos:** `server/routes.ts`, `src/services/authService.ts`.
  - **Ação:** Substituir o token cosmético por JWT assinado com `JWT_SECRET`.
- **Tarefa A.2:** Proteger rotas críticas do Express.
  - **Arquivos:** `server/routes.ts`
  - **Ação:** Criar Middleware `requireAuth` e injetar nas rotas de CRUD.
- **Critério de Aceite:** O React não carrega ou salva dados sem um token legítimo. O banco de dados está protegido.

## FASE B — Integridade e Recuperação (Prioridade Alta)
**Foco:** Offline-first e prevenção de sobrescrita.
- **Tarefa B.1:** Estabelecer Timestamp / Sync Queue.
  - **Arquivos:** `src/services/storageService.ts`
  - **Ação:** Implementar fila de operações locais.
- **Tarefa B.2:** Controle do limite de API no Banco.
  - **Arquivos:** `server/vision.ts`
  - **Ação:** Salvar contagem de cota diária do Gemini no PostgreSQL em vez de memória RAM.
- **Critério de Aceite:** Reiniciar o servidor não zera a contagem de cotas. Bipagens sem internet geram fila e sincronizam no retorno da rede sem destruir dados existentes.

## FASE C — Testes e Refatoração Segura (Prioridade Média)
**Foco:** Modularização.
- **Tarefa C.1:** Quebrar o Monólito `routes.ts`.
  - **Arquivos:** `server/routes.ts` -> `/server/routes/produtos.ts`, etc.
  - **Ação:** Isolar as rotas mantendo os exatos mesmos contratos.
- **Critério de Aceite:** O arquivo `routes.ts` serve apenas como orquestrador raiz. 

## FASE D — Evolução Arquitetural (Prioridade Baixa)
**Foco:** RAG verdadeiro e armazenamento robusto.
- **Tarefa D.1:** Migrar Chat Memory para Banco de Dados.
  - **Arquivos:** `server/chat.ts`
  - **Ação:** Gravar `sessionFlowStates` no banco para suportar instâncias Vercel serverless.
- **Tarefa D.2:** Avaliar IndexedDB para o Frontend PWA.
  - **Arquivos:** `src/services/storageService.ts`
- **Critério de Aceite:** O "Assistente" lembra o orcamento mesmo se a aba for fechada e reaberta 2 horas depois.
