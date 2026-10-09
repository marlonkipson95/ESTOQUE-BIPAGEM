# Matriz de Riscos de Segurança (Revalidada)

| Vulnerabilidade | Gravidade | Componente | Mitigação no Plano |
|---|---|---|---|
| Acesso API sem Token | CRÍTICA | `server/routes.ts` | Fase A (A.1, A.2) - Inserção de Middleware JWT. |
| Perda de Faturamento / Cota da IA | ALTA | `server/vision.ts` | Fase B (B.2) - Registro da contagem no DB, evitando reset de cota. |
| Injeção de SQL | MÉDIA | `server/chat.ts` | Revisão das chamadas `client.query` (maioria utiliza `$1`, mas o código acoplado facilita inserção insegura no futuro). |
| CORS Permissivo | BAIXA | `server.ts` | Restringir as origens do CORS ao domínio de produção e localhost durante dev. |
