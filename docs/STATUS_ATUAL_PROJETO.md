# STATUS ATUAL DO PROJETO - KIPSTOCK

**Última Atualização:** 2026-10-09

## 1. Estado Atual do Sistema
O KIPSTOCK é um sistema de gestão de estoque e bipagem (PWA offline-first). 
- A **Fase A (Segurança Zero-Trust)** foi concluída com sucesso. O sistema valida identidades no backend com JWT, senhas em `bcryptjs` e protege todas as rotas privadas.
- A **Fase B1 e B2 (Chatbot Data-Grounded & Visão)** foi concluída com sucesso. O chatbot agora utiliza `gemini-3.8-flash` via Function Calling nativo com persistência de carrinho na tabela `orcamentos_pendentes` no PostgreSQL. A identificação por foto está totalmente operacional e exposta na tela principal de Bipagem.
- A- **Fase B (Integridade & Sync Queue Offline-First)** foi concluída com sucesso. Foi implementada a fila de sincronização `kipson_sync_queue_v1` com merge protetivo contra *Last Write Wins*, auto-reconexão no evento `online`, e controle persistente de cotas de IA na tabela `api_quotas` do PostgreSQL.
- **Fase C (Modularização do Backend)** foi concluída com sucesso. O monólito `server/routes.ts` de 3.401 linhas foi desmembrado em submódulos elegantes em `server/routes/`, mantendo 100% dos contratos das rotas e das regras de negócio.

## 2. Arquitetura e Tecnologias
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Lucide React, PWA offline-first.
- **Backend:** Node.js, Express.js (ES Modules, arquitetura desacoplada em `server/routes/*.routes.ts`).
- **Banco de Dados:** PostgreSQL (Neon) com pooling SSL e schemas versionados.
- **Segurança:** Autenticação via JWT com hash bcryptjs (Zero-Trust global no Express `routes.ts`).
- **Armazenamento Local & Sincronização:** LocalStorage via `storageService.ts` com Sync Queue resiliente, idempotência e tratamento de falhas de rede.
- **Inteligência Artificial:** SDK oficial `@google/genai` com `gemini-3.8-flash` para Visão Computacional de peças e Function Calling de consultas ao estoque.

## 3. Conquistas Recentes
- **Modularização de Rotas (Fase C):** Monólito fatiado em `auth.routes.ts`, `produtos.routes.ts`, `orcamentos.routes.ts`, `auditoria.routes.ts`, `listas.routes.ts`, `dashboard.routes.ts` e `importar.routes.ts`.
- **Sync Queue Resiliente:** Operações realizadas sem internet entram na fila e são enviadas automaticamente ao restabelecer a rede, com contador visual no Header.
- **Prevenção de Sobrescrita Destrutiva:** `syncWithBackend()` mescla preservando produtos locais que possuem pendências não enviadas.
- **Cota Persistente da Visão:** Tabela `api_quotas` impede perda de contadores de consumo diário em reinicializações do servidor.

## 4. Estado das Fases
- [x] **Fase A:** Autenticação Zero-Trust & JWT (Concluída)
- [x] **Fase B1/B2:** Chatbot Data-Grounded & Visão Computacional (Concluída)
- [x] **Fase B:** Integridade & Sync Queue Offline-First (Concluída)
- [x] **Fase C:** Modularização e Desacoplamento de Rotas (Concluída)
- [ ] **Fase D:** Avaliação de melhorias PWA / IndexedDB em larga escala (Futuro)
