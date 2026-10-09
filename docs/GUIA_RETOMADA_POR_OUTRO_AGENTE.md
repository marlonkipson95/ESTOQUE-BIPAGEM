# GUIA DE RETOMADA POR OUTRO AGENTE

Bem-vindo! Se você assumiu este projeto, leia este documento para não destruir o progresso alcançado até agora e saber exatamente onde atuar.

## 1. Regras Absolutas de Continuidade
1. **Zero-Trust Ativo:** O arquivo `server/routes.ts` possui um interceptor JWT global (`requireAuth`). Todas as requisições (exceto `/health` e `/auth/login`) devem possuir o cabeçalho `Authorization: Bearer <token>`. Não remova essa proteção.
2. **Offline-First:** O sistema utiliza `storageService.ts` no frontend para garantir que as bipagens de estoque ocorram mesmo sem internet. Respostas HTTP 401 disparam um evento de logout, mas **não apagam a fila do `storageService`**. Nunca adicione código que resete o localStorage em caso de quedas ou tokens expirados.
3. **Sem Frameworks Invasivos:** O projeto roda de forma nativa e sem necessidade de reconstrução. O backend e o frontend coexistem na porta 3000 (Vite interceptando a API).

## 2. O Que Foi Concluído
- [x] **Fase A:** Migração de senhas em texto puro para `bcryptjs` no PostgreSQL.
- [x] **Fase A:** Criação e integração do `apiService.fetchWithAuth` no Frontend para injetar os JWTs silenciosamente em todas as operações de banco.
- [x] **Auditoria B1:** O Chatbot (`server/chat.ts`) foi dissecado. Comprovamos que ele **NÃO** usa RAG nem LLM, apesar de enganar o usuário com textos prontos dizendo "RAG ativado". Ele opera inteiramente por Regex e blocos If/Else massivos. O relatório de arquitetura ideal já foi proposto e validado em `docs/ARQUITETURA_CHATBOT_RAG.md`.

## 3. Seu Ponto de Partida (Sua Missão Atual)
A sua missão é pegar o `ARQUITETURA_CHATBOT_RAG.md` e executar a codificação da Fase B.
Você deve:
1. Analisar os ~2100 linhas de Regex em `server/chat.ts`.
2. Substituir por uma arquitetura elegante baseada em `GoogleGenAI` (Gemini) usando Function Calling / Tools.
3. As tools devem bater nas queries já existentes (como `searchProductDb`) para extrair os dados diretamente do PostgreSQL, e DEVOLVER o resultado ao LLM para formatação, impedindo invenções (*Princípio Data-Grounded*).
4. O uso da Chave de API precisará estar configurado no `.env` do KIPSTOCK (Verifique se o usuário já inseriu e o `process.env.GEMINI_API_KEY` tem acesso válido).
5. Exija o `userId` oriundo do Token JWT descriptografado (`req.user.id`) para atrelar sessões de conversa e orçamentos pendentes a um usuário específico, evitando vazamentos e misturas de cache de estado global (atualmente o state map do bot é compartilhado por IP ou de forma global não isolada perfeitamente).

## 4. O Que Fazer Assim Que Iniciar
1. Acesse o `.env` local.
2. Proponha ao usuário rodar um script de teste para validar se as tools do Gemini funcionam no backend.
3. Se o script funcionar, aplique a refatoração completa em `server/chat.ts`.
